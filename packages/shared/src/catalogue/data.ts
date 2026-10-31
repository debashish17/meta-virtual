import buildsJson from "./builds.generated.json";
import catalogueJson from "./catalogue.generated.json";
import { Builds } from "./builds.js";
import { Catalogue } from "./schema.js";

/**
 * The generated catalogue and build data, validated. Exported as `@office/shared/catalogue` rather
 * than from the package root so the server and the office scene never load these files.
 */
export const CATALOGUE = Catalogue.parse(catalogueJson);
export const BUILDS = Builds.parse(buildsJson);
