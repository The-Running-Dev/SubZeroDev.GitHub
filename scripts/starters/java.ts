// Writes the Java starter files: a Maven project for Java 21 with JUnit and Checkstyle (Google style).

import { writeProjectFile } from '../lib/files.ts';
import type { Log } from '../lib/log.ts';
import { javaPackage, kebabName } from './names.ts';
import { mavenVersion } from './versions.ts';

export function javaStarter(log: Log, projectPath: string, projectName: string): void {
  const write = (relativePath: string, content: string) => writeProjectFile(projectPath, relativePath, content, { force: true });
  log.step('Setting up Java starter files');

  const version = mavenVersion();
  const pkg = javaPackage(projectName);
  const pkgPath = pkg.replace(/\./g, '/');
  write('pom.xml', `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>${pkg}</groupId>
  <artifactId>${kebabName(projectName)}</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <packaging>jar</packaging>
  <name>${projectName}</name>

  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>

  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>org.junit</groupId>
        <artifactId>junit-bom</artifactId>
        <version>${version('junit-bom')}</version>
        <type>pom</type>
        <scope>import</scope>
      </dependency>
    </dependencies>
  </dependencyManagement>

  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <finalName>app</finalName>
    <plugins>
      <plugin>
        <artifactId>maven-clean-plugin</artifactId>
        <version>${version('maven-clean-plugin')}</version>
      </plugin>
      <plugin>
        <artifactId>maven-resources-plugin</artifactId>
        <version>${version('maven-resources-plugin')}</version>
      </plugin>
      <plugin>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>${version('maven-compiler-plugin')}</version>
        <configuration>
          <compilerArgs>
            <arg>-Xlint:all</arg>
          </compilerArgs>
          <failOnWarning>true</failOnWarning>
        </configuration>
      </plugin>
      <plugin>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>${version('maven-surefire-plugin')}</version>
      </plugin>
      <plugin>
        <artifactId>maven-jar-plugin</artifactId>
        <version>${version('maven-jar-plugin')}</version>
        <configuration>
          <archive>
            <manifest>
              <mainClass>${pkg}.App</mainClass>
            </manifest>
          </archive>
        </configuration>
      </plugin>
      <plugin>
        <artifactId>maven-install-plugin</artifactId>
        <version>${version('maven-install-plugin')}</version>
      </plugin>
      <plugin>
        <artifactId>maven-checkstyle-plugin</artifactId>
        <version>${version('maven-checkstyle-plugin')}</version>
        <dependencies>
          <dependency>
            <groupId>com.puppycrawl.tools</groupId>
            <artifactId>checkstyle</artifactId>
            <version>${version('checkstyle')}</version>
          </dependency>
        </dependencies>
        <configuration>
          <configLocation>google_checks.xml</configLocation>
          <consoleOutput>true</consoleOutput>
          <includeTestSourceDirectory>true</includeTestSourceDirectory>
          <violationSeverity>warning</violationSeverity>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>`);

  // Keeps Maven's download progress out of build logs.
  write('.mvn/maven.config', '--no-transfer-progress');

  write(`src/main/java/${pkgPath}/Greeting.java`, `package ${pkg};

/** Builds the greeting the application prints. */
public final class Greeting {
  private Greeting() {}

  /**
   * Returns the welcome message for a project.
   *
   * @param name the project name
   * @return the welcome message
   */
  public static String forName(String name) {
    return "Welcome to " + name;
  }
}`);

  write(`src/main/java/${pkgPath}/App.java`, `package ${pkg};

/** Prints the greeting. */
public final class App {
  private App() {}

  /**
   * Starts the application.
   *
   * @param args the command-line arguments, unused
   */
  public static void main(String[] args) {
    System.out.println(Greeting.forName("${projectName}"));
  }
}`);

  write(`src/test/java/${pkgPath}/GreetingTest.java`, `package ${pkg};

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class GreetingTest {
  @Test
  void welcomesTheNamedProject() {
    assertEquals("Welcome to Example.Project", Greeting.forName("Example.Project"));
  }
}`);

  log.success('Java starter files written');
}
