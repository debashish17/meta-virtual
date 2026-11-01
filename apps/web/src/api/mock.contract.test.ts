import { officeApiContract } from "./contract.js";
import { createMockApi } from "./mock.js";

officeApiContract(() => createMockApi());
