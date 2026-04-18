package {{package_name}};

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
@RequestMapping("{{route_path}}")
public class {{class_name}}Controller {
  private final {{class_name}}Service service;

  public {{class_name}}Controller({{class_name}}Service service) {
    this.service = service;
  }

  @GetMapping
  public Map<String, Object> index() {
    return service.payload();
  }
}
