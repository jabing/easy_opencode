package {{package_name}};

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;

class {{class_name}}ServiceTest {
  @Test
  void executeReturnsStarterResult() {
    assertEquals("{{kebab_name}}", new {{class_name}}Service().execute());
  }
}
