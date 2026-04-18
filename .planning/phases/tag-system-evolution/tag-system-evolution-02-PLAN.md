---
phase: tag-system-evolution
plan: 02
name: Schema Migration + tagType Enum + Backfill + Type Updates
type: execute
wave: 2
depends_on:
  - tag-system-evolution-01
files_modified:
  - lib/db/schema.ts
  - lib/types/api.ts
  - lib/repositories/tag-repository.ts
  - scripts/backfill-tag-types.ts
autonomous: true
requirements:
  - D-01
  - D-02
  - D-03
  - D-04
  - D-05
  - D-06

must_haves:
  truths:
    - "Tags can be classified as technology/category/level"
    - "Existing tags continue working without breakage (backward compatible)"
    - "Developers can query tags by type through the repository layer"
    - "Backfill script achieves >= 70% type coverage on existing tags"
  artifacts:
    - path: "lib/db/schema.ts"
      provides: "tagTypeTypeEnum pgEnum, tagType column on tutorialTags"
      contains: "tagTypeTypeEnum"
    - path: "lib/types/api.ts"
      provides: "TutorialTag with tagType field, TagTypeType union type"
      contains: "tagType"
    - path: "scripts/backfill-tag-types.ts"
      provides: "One-time AI batch backfill script for tagType classification"
  key_links:
    - from: "lib/repositories/tag-repository.ts"
      to: "lib/db/schema.ts"
      via: "import tagTypeTypeEnum and use in queries"
      pattern: "tagTypeTypeEnum"
    - from: "scripts/backfill-tag-types.ts"
      to: "lib/ai/tag-generator.ts"
      via: "AI SDK generateText + Output.object for classification"
      pattern: "generateText"
---

<objective>
Add the tagType classification dimension to the tag system: schema migration (pgEnum + column), TypeScript type updates, and AI backfill script.

Purpose: The tagType dimension (technology/category/level) is the structural foundation for all subsequent features -- controlled vocabulary, Explore tab navigation, tag relations, and user follows. This must ship before anything else in V+2/V+3 can work.

Output: A migrated database with tagType column, updated TypeScript types, and a runnable backfill script.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/tag-system-evolution/tag-system-evolution-CONTEXT.md
@.planning/phases/tag-system-evolution/tag-system-evolution-RESEARCH.md
@lib/db/schema.ts
@lib/types/api.ts
@lib/repositories/tag-repository.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add tagType pgEnum + column to schema + update TypeScript types</name>
  <files>lib/db/schema.ts, lib/types/api.ts, lib/repositories/tag-repository.ts</files>
  <read_first>
    - lib/db/schema.ts (full file -- pgEnum patterns at lines 21-55, tutorialTags at lines 254-261)
    - lib/types/api.ts (full file -- TutorialTag interface at lines 66-71)
    - lib/repositories/tag-repository.ts (full file -- toTutorialTag mapper at lines 8-15)
  </read_first>
  <action>
**D-04: Schema uses pgEnum for tagType, allows NULL**

1. In `lib/db/schema.ts`, add the new pgEnum after the existing enums (after line 55):
   ```typescript
   // v3.11: Tag classification dimension
   export const tagTypeTypeEnum = pgEnum('tag_type_type', ['technology', 'category', 'level']);
   ```

2. In the same file, add the `tagType` column to `tutorialTags` table definition:
   ```typescript
   export const tutorialTags = pgTable('tutorial_tags', {
     id: uuid('id').primaryKey().defaultRandom(),
     name: varchar('name', { length: 64 }).notNull().unique(),
     slug: varchar('slug', { length: 64 }).notNull().unique(),
     tagType: tagTypeTypeEnum('tag_type'),  // nullable -- D-04: NULL allowed for unclassified tags
     createdAt: timestamp('created_at', { withTimezone: true })
       .defaultNow()
       .notNull(),
   });
   ```

3. Generate the Drizzle migration:
   ```bash
   npx drizzle-kit generate
   ```
   Verify the generated SQL contains:
   ```sql
   CREATE TYPE "tag_type_type" AS ENUM ('technology', 'category', 'level');
   ALTER TABLE "tutorial_tags" ADD COLUMN "tag_type" "tag_type_type";
   ```

4. In `lib/types/api.ts`, update the TutorialTag interface:
   ```typescript
   export type TagTypeType = 'technology' | 'category' | 'level';

   export interface TutorialTag {
     id: string;
     name: string;
     slug: string;
     tagType?: TagTypeType | null;  // nullable -- D-04
     createdAt: Date;
   }
   ```

5. In `lib/repositories/tag-repository.ts`, update the `toTutorialTag` mapper to include `tagType`:
   ```typescript
   function toTutorialTag(row: TutorialTagRow): TutorialTag {
     return {
       id: row.id,
       name: row.name,
       slug: row.slug,
       tagType: row.tagType ?? null,
       createdAt: row.createdAt,
     };
   }
   ```

6. In `lib/repositories/tag-repository.ts`, add a new query function:
   ```typescript
   export async function getTagsByType(tagType: TagTypeType): Promise<TutorialTag[]> {
     const rows = await db
       .select()
       .from(tutorialTags)
       .where(eq(tutorialTags.tagType, tagType));
     return rows.map(toTutorialTag);
   }
   ```
   Import `TagTypeType` from `'../types/api'`.

7. Update the `listAllTags` function to include `tagType` in the select and return objects (add `tagType: tutorialTags.tagType` to the select, and `tagType: row.tagType` to the mapped result).
  </action>
  <verify>
    <automated>npx drizzle-kit generate && npm test</automated>
  </verify>
  <done>
    - tagTypeTypeEnum pgEnum exists in schema.ts with values ['technology', 'category', 'level']
    - tutorialTags table has nullable tagType column
    - Migration SQL generated and committed in drizzle/ directory
    - TutorialTag type includes optional tagType field
    - TagTypeType union type exported from lib/types/api.ts
    - toTutorialTag mapper includes tagType
    - getTagsByType function queries by tagType enum value
    - listAllTags returns objects with tagType field
  </done>
</task>

<task type="auto">
  <name>Task 2: Create AI backfill script for tagType classification</name>
  <files>scripts/backfill-tag-types.ts</files>
  <read_first>
    - lib/db/schema.ts (to verify tagTypeTypeEnum import path)
    - lib/repositories/tag-repository.ts (to import listAllTags, update tag type)
    - lib/ai/tag-generator.ts (to follow the AI SDK generateText + Output.object pattern)
  </read_first>
  <action>
**D-05: AI batch backfill tagType, target >= 70% coverage**

Create `scripts/backfill-tag-types.ts` as a standalone Node.js script that:

1. Import dependencies:
   ```typescript
   import { generateText, Output } from 'ai';
   import { createProvider } from '../lib/ai/provider-registry';
   import { supportsNativeStructuredOutput } from '../lib/ai/model-capabilities';
   import { parseJsonFromText } from '../lib/ai/parse-json-text';
   import { db } from '../lib/db';
   { tutorialTags } from '../lib/db/schema';
   import { eq } from 'drizzle-orm';
   import { z } from 'zod';
   ```

2. Define the classification schema:
   ```typescript
   const tagClassificationSchema = z.object({
     classifications: z.array(z.object({
       tagName: z.string(),
       tagType: z.enum(['technology', 'category', 'level', 'unknown']),
     })),
   });
   ```

3. Query all tags where `tagType IS NULL` from the database.

4. Process tags in batches of 20 (to stay within context limits). For each batch:
   - Build a prompt that includes:
     - The three tagType definitions per D-01/D-02/D-06:
       - `technology`: Specific technologies, frameworks, libraries, knowledge points (React, Python, Docker, React Hooks, load balancing)
       - `category`: Broad domains (Frontend, Backend, DevOps, AI/ML, Mobile, Database, Security, Systems)
       - `level`: Difficulty (入门/Beginner, 进阶/Intermediate, 实战/Advanced)
     - The list of tag names to classify
     - Instruction: "Classify each tag into one of: technology, category, level. Use 'unknown' if uncertain."
   - Use the same `Output.object` + native/non-native pattern from `tag-generator.ts`
   - Parse the response

5. For each classified tag where tagType is not 'unknown':
   - Update the database: `UPDATE tutorial_tags SET tag_type = $1 WHERE name = $2`
   - Use Drizzle: `db.update(tutorialTags).set({ tagType: classification.tagType }).where(eq(tutorialTags.name, classification.tagName))`

6. Log progress: `Processed batch N: X classified, Y unknown, Z errors`

7. At the end, report:
   - Total tags processed
   - Tags classified (with breakdown by tagType)
   - Tags remaining NULL
   - Coverage percentage

8. The script should be runnable via: `npx tsx scripts/backfill-tag-types.ts`

**Important: Do NOT run the script automatically.** The executor should create it, verify it compiles, but the actual backfill should be run by the developer when ready (requires DB connection + AI API key).
  </action>
  <verify>
    <automated>npx tsc --noEmit scripts/backfill-tag-types.ts 2>&1 | head -5 || echo "Script file exists"</automated>
  </verify>
  <done>
    - scripts/backfill-tag-types.ts exists and compiles without errors
    - Script fetches tags with NULL tagType
    - Script classifies tags in batches of 20 using AI SDK
    - Script updates tagType in database for classified tags
    - Script reports coverage percentage at the end
    - Script follows the established AI SDK pattern (Output.object + native/non-native split)
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backfill script -> DB | Batch writes updating tagType on existing rows |
| AI provider -> backfill script | Classification results validated by Zod enum |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Tampering | tagType column | accept | pgEnum constrains valid values at DB level; no untrusted input |
| T-02-02 | Tampering | AI backfill classification | mitigate | Zod enum validation rejects invalid tagType values; 'unknown' tags stay NULL |
| T-02-03 | Denial of Service | backfill script | accept | Manual one-time execution; batch processing prevents memory issues |
</threat_model>

<verification>
- `npm test` passes
- Migration SQL generated without errors
- `npx tsx scripts/backfill-tag-types.ts --help` or script compiles without errors
- Manual: Run migration on dev DB, verify tag_type column exists and is nullable
</verification>

<success_criteria>
- tagTypeTypeEnum pgEnum with values technology, category, level
- tutorialTags.tagType column is nullable (existing tags unaffected)
- TutorialTag type includes tagType field
- getTagsByType function works
- Backfill script exists and compiles, ready for execution
</success_criteria>

<output>
After completion, create `.planning/phases/tag-system-evolution/tag-system-evolution-02-SUMMARY.md`
</output>
