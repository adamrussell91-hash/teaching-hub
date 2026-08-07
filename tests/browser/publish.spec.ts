import { expect, test } from '@playwright/test';

test('teacher publishes lesson visible on student URL', async ({ page, context }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Passphrase').fill('teaching-hub-local');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByRole('heading', { name: 'Lessons' })).toBeVisible();

  await page.getByRole('button', { name: 'Year 12' }).click();
  await page.getByRole('button', { name: 'English Advanced' }).click();
  await page.getByRole('button', { name: 'Artist of the Floating World' }).click();
  await page.getByRole('link', { name: 'Memory, Identity and Ono' }).click();

  const titleField = page.getByLabel('Lesson title');
  await expect(titleField).toBeVisible();
  await titleField.fill('Memory, Identity and Ono');

  await page.getByRole('button', { name: /^publish$/i }).click();

  await expect(
    page.getByText('Published. Students can now view this lesson at:')
  ).toBeVisible();

  const student = await context.newPage();
  await student.goto('/s/lessons/lesson_aotfw_008');

  await expect(student.locator('.student-surface__title')).toHaveText(
    'Memory, Identity and Ono'
  );
  await expect(student.getByText(/teacher only/i)).toHaveCount(0);
});
