import { session } from '../browser/session.js';

export async function screenshotTool(): Promise<{ base64: string }> {
  const page = await session.getPage();
  const base64 = await session.takeScreenshot(page);
  await page.close();
  return { base64 };
}
