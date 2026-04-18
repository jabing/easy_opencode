package {{package_name}};

import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class {{class_name}}Service {
  public Map<String, Object> payload() {
    return Map.of("ok", true, "route", "{{route_path}}", "handler", "{{class_name}}Controller");
  }
}
