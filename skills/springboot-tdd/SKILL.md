---
name: springboot-tdd
description: Test-driven development for Spring Boot using JUnit 5, Mockito, MockMvc, Testcontainers, and JaCoCo. Use when adding features, fixing bugs, or refactoring.
origin: EOC
---

# Spring Boot TDD Workflow

## When to Activate

- Trigger this skill when the request clearly matches this skill's domain.
- Use this skill before writing implementation details outside its scope.
- If multiple skills overlap, follow `skills/ROUTING_GUIDE.md` precedence rules.


TDD guidance for Spring Boot services with 80%+ coverage (unit + integration).

## When to Use

- New features or endpoints
- Bug fixes or refactors
- Adding data access logic or security rules

## Workflow

1) Write tests first (they should fail)
2) Implement minimal code to pass
3) Refactor with tests green
4) Enforce coverage (JaCoCo)

## Unit Tests (JUnit 5 + Mockito)

```java
@ExtendWith(MockitoExtension.class)
class MarketServiceTest {
  @Mock MarketRepository repo;
  @InjectMocks MarketService service;

  @Test
  void createsMarket() {
    CreateMarketRequest req = new CreateMarketRequest("name", "desc", Instant.now(), List.of("cat"));
    when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

    Market result = service.create(req);

    assertThat(result.name()).isEqualTo("name");
    verify(repo).save(any());
  }
}
```

Patterns:
- Arrange-Act-Assert
- Avoid partial mocks; prefer explicit stubbing
- Use `@ParameterizedTest` for variants

## Web Layer Tests (MockMvc)

```java
@WebMvcTest(MarketController.class)
class MarketControllerTest {
  @Autowired MockMvc mockMvc;
  @MockBean MarketService marketService;

  @Test
  void returnsMarkets() throws Exception {
    when(marketService.list(any())).thenReturn(Page.empty());

    mockMvc.perform(get("/api/markets"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content").isArray());
  }
}
```

## Integration Tests (SpringBootTest)

```java
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MarketIntegrationTest {
  @Autowired MockMvc mockMvc;

  @Test
  void createsMarket() throws Exception {
    mockMvc.perform(post("/api/markets")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {"name":"Test","description":"Desc","endDate":"2030-01-01T00:00:00Z","categories":["general"]}
        """))
      .andExpect(status().isCreated());
  }
}
```

## Persistence Tests (DataJpaTest)

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestContainersConfig.class)
class MarketRepositoryTest {
  @Autowired MarketRepository repo;

  @Test
  void savesAndFinds() {
    MarketEntity entity = new MarketEntity();
    entity.setName("Test");
    repo.save(entity);

    Optional<MarketEntity> found = repo.findByName("Test");
    assertThat(found).isPresent();
  }
}
```

## Testcontainers

- Use reusable containers for Postgres/Redis to mirror production
- Wire via `@DynamicPropertySource` to inject JDBC URLs into Spring context

## Coverage (JaCoCo)

Maven snippet:
```xml
<plugin>
  <groupId>org.jacoco</groupId>
  <artifactId>jacoco-maven-plugin</artifactId>
  <version>0.8.14</version>
  <executions>
    <execution>
      <goals><goal>prepare-agent</goal></goals>
    </execution>
    <execution>
      <id>report</id>
      <phase>verify</phase>
      <goals><goal>report</goal></goals>
    </execution>
  </executions>
</plugin>
```

## Assertions

- Prefer AssertJ (`assertThat`) for readability
- For JSON responses, use `jsonPath`
- For exceptions: `assertThatThrownBy(...)`

## Test Data Builders

```java
class MarketBuilder {
  private String name = "Test";
  MarketBuilder withName(String name) { this.name = name; return this; }
  Market build() { return new Market(null, name, MarketStatus.ACTIVE); }
}
```

## CI Commands

- Maven: `mvn -T 4 test` or `mvn verify`
- Gradle: `./gradlew test jacocoTestReport`

**Remember**: Keep tests fast, isolated, and deterministic. Test behavior, not implementation details.

## Open-Source Benchmarks

Reference projects for `springboot-tdd` optimization:

- [pytest-dev/pytest](https://github.com/pytest-dev/pytest) - Mature test ergonomics and fixture patterns.
- [microsoft/playwright](https://github.com/microsoft/playwright) - Robust, cross-browser E2E automation.

### Optimization Guidance
- Adopt table-driven and parameterized test styles.
- Standardize fixture lifecycles and test data factories.
- Separate fast unit gates from slower integration/E2E gates.

## Acceptance Criteria

- Inputs: Clear task scope, target files/systems, and explicit constraints.
- Outputs: Concrete artifact (code/doc/config/decision) aligned with this skill domain.
- Validation: At least one executable check or deterministic review step is defined and run.
- Done: Result is actionable, non-contradictory with adjacent skills, and mapped to user intent.

## Skill Metadata

- Owner: `easy-opencode-team`
- Version: `1.0.0`
- Last Reviewed: `2026-04-11`
- Stability: `stable`
- Overlap Domain: `testing`

