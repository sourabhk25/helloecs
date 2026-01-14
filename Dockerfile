## ---------- Build stage ----------
#FROM gradle:8.10-jdk17 AS build
#WORKDIR /home/gradle/project
#COPY --chown=gradle:gradle . .
#RUN gradle clean bootJar --no-daemon
#
## ---------- Run stage ----------
#FROM eclipse-temurin:17-jre
#WORKDIR /app
#
## Copy the built jar
#COPY --from=build /home/gradle/project/build/libs/*.jar app.jar
#
#EXPOSE 8080
#ENV JAVA_OPTS=""
#
## Run Spring Boot
#ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]

# simple dockerfile as docker build was taking hours, it assumes gradle has created jar earlier
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]