/**
 * One-off: writes the researcher profile text and the academic networks.
 *
 * Kept as a script because it writes to the real CvLAC, which has no undo. Run
 * it yourself, read what it prints, and delete it when the profile is set:
 *
 *   cd ~/dev/cvlac-mcp && npx tsx scripts/write-profile.mts <archivo-con-el-texto>
 *
 * The profile text is read from the file given as the argument, so the text a
 * human approved is the text that gets written — nothing is embedded here.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

const ROOT = join(import.meta.dirname, '..');
dotenv.config({ path: join(ROOT, '.env'), override: false, quiet: true });

const { session } = await import('../src/browser/session.js');
const { navigate } = await import('../src/browser/navigate.js');
const { URLS } = await import('../src/browser/navigation.js');
const { updateProfileTool, readProfileTool } = await import('../src/tools/profile.js');

const textFile = process.argv[2];
if (!textFile) {
  console.error('Usage: npx tsx scripts/write-profile.mts <archivo-con-el-texto-del-perfil>');
  process.exit(2);
}
const description = readFileSync(textFile, 'utf8').trim();

// The limit is checked before writing: a silently truncated bio in an official
// record is worse than a refusal.
await session.login();
const page = await session.getPage();
await navigate(page, URLS.perfil);
const max = await page.$eval('textarea[name="txt_desc_perfil"]', (t) => t.getAttribute('maxlength'));
await page.close();
console.log(`maxlength=${max ?? 'none'}  text=${description.length}`);
if (max && description.length > Number(max)) {
  console.error('Refusing to write: the text is longer than the field accepts.');
  process.exit(1);
}

const result = await updateProfileTool({
  description,
  networks: [
    { network: 'linkedin', url: 'https://www.linkedin.com/in/stivenson-rincon/' },
    { network: 'otro', url: 'https://github.com/stivenson', label: 'GitHub' },
  ],
});

const { screenshotBase64, ...rest } = result as Record<string, unknown>;
console.log('\nRESULT:', JSON.stringify(rest, null, 2));
console.log('\nREAD BACK:', JSON.stringify(await readProfileTool(), null, 2));

await session.close();
process.exit(result.success ? 0 : 1);
