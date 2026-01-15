import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface EcsHelloStackProps extends cdk.StackProps {
    appName: string;
    containerPort: number;
    desiredCount: number;
    cpu: number;
    memoryMiB: number;
}

export class EcsHelloStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EcsHelloStackProps) {
        super(scope, id, props);

        const { appName, containerPort, desiredCount, cpu, memoryMiB } = props;

        const vpc = new ec2.Vpc(this, "Vpc", {
            maxAzs: 2,
            natGateways: 1,
        });

        const cluster = new ecs.Cluster(this, "Cluster", {
            vpc,
            clusterName: `${appName}-cluster`,
        });

        const repo = new ecr.Repository(this, "Repo", {
            repositoryName: `${appName}-repo`,
            imageScanOnPush: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteImages: true,
        });

        const logGroup = new logs.LogGroup(this, "LogGroup", {
            logGroupName: `/ecs/${appName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const executionRole = new iam.Role(this, "ExecutionRole", {
            assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        });
        executionRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")
        );

        const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
            cpu,
            memoryLimitMiB: memoryMiB,
            executionRole,
        });

        // Uses :latest for simplest deploy (pipelines push latest + force redeploy)
        const container = taskDef.addContainer("AppContainer", {
            containerName: appName,
            image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
            logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "app" }),
            environment: { SPRING_PROFILES_ACTIVE: "default" },
        });

        container.addPortMappings({ containerPort });

        const albSg = new ec2.SecurityGroup(this, "AlbSg", { vpc });
        albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP from internet");

        const svcSg = new ec2.SecurityGroup(this, "SvcSg", { vpc });
        svcSg.addIngressRule(albSg, ec2.Port.tcp(containerPort), "ALB to ECS");

        const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
            vpc,
            internetFacing: true,
            securityGroup: albSg,
            loadBalancerName: `${appName}-alb`,
        });

        const listener = alb.addListener("HttpListener", { port: 80, open: true });

        const service = new ecs.FargateService(this, "Service", {
            cluster,
            taskDefinition: taskDef,
            desiredCount,
            assignPublicIp: false,
            serviceName: `${appName}-service`,
            securityGroups: [svcSg],
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        });

        listener.addTargets("Targets", {
            port: containerPort,
            targets: [service],
            healthCheck: {
                path: "/actuator/health",
                healthyHttpCodes: "200",
            },
        });

        new cdk.CfnOutput(this, "AlbUrl", { value: `http://${alb.loadBalancerDnsName}` });
        new cdk.CfnOutput(this, "EcrRepoUri", { value: repo.repositoryUri });
        new cdk.CfnOutput(this, "EcrRepoName", { value: repo.repositoryName });
        new cdk.CfnOutput(this, "ClusterName", { value: cluster.clusterName });
        new cdk.CfnOutput(this, "ServiceName", { value: service.serviceName });
    }
}
