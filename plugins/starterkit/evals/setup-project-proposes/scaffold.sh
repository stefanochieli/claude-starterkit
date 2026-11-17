#!/usr/bin/env bash
# Minimal Maven + Spring Boot fixture, so the skill has a real repository to analyse.
set -euo pipefail
mkdir -p src/main/java/com/example/demo src/test/java/com/example/demo
cat > pom.xml <<'POM'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
  </parent>
  <groupId>com.example</groupId>
  <artifactId>demo</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <properties><java.version>21</java.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>
  </dependencies>
</project>
POM
cat > src/main/java/com/example/demo/DemoApplication.java <<'J'
package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {
  public static void main(String[] args) { SpringApplication.run(DemoApplication.class, args); }
}
J
cat > src/test/java/com/example/demo/DemoApplicationTests.java <<'J'
package com.example.demo;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class DemoApplicationTests {
  @Test void contextLoads() {}
}
J
printf '# demo\n\nBuild and test: `mvn verify`. Run: `mvn spring-boot:run`.\n' > README.md
