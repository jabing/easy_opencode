package {{package_name}};

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest({{class_name}}Controller.class)
class {{class_name}}ControllerTest {
  @Autowired
  private MockMvc mockMvc;

  @MockBean
  private {{class_name}}Service service;

  @Test
  void returnsOkPayload() throws Exception {
    given(service.payload()).willReturn(Map.of("ok", true, "route", "{{route_path}}"));

    mockMvc.perform(get("{{route_path}}"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.ok").value(true))
      .andExpect(jsonPath("$.route").value("{{route_path}}"));
  }
}
