import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const LOGIN_URL = "/pomidorqa/auth/login";
const REGISTER_URL = "/pomidorqa/auth/register";
const ACCOUNTS_URL = "/api/pomidorqa/test/accounts";

export type TestUser = {
  name: string;
  email: string;
  password: string;
};

export type ParticipantSession = {
  user: TestUser;
  context: BrowserContext;
  page: Page;
};

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function makeUser(role: string, runId: number): TestUser {
  return {
    name: `${role} Автотест ${randomSuffix()}`,
    email: `${role}-${runId}-${randomSuffix()}@example.com`,
    password: "testpass123",
  };
}

export function uniqueTag(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomSuffix()}`;
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto(LOGIN_URL);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

export async function registerViaUi(page: Page, user: TestUser) {
  await page.goto(REGISTER_URL);
  await page.getByLabel("Имя").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Пароль").fill(user.password);
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
}

export async function logOut(page: Page) {
  const logoutButton = page.getByRole("button", { name: "Выйти" });
  await logoutButton.click();
  await expect(logoutButton).toBeHidden({ timeout: 10_000 });
}

export async function createUserViaApi(
  context: BrowserContext,
  user: TestUser,
): Promise<TestUser> {
  const response = await context.request.post(ACCOUNTS_URL, { data: user });
  if (response.status() !== 201) {
    throw new Error(
      `Регистрация ${user.email} не удалась: ${response.status()} ${await response.text()}`,
    );
  }
  return user;
}

export async function deleteUserViaApi(context: BrowserContext): Promise<void> {
  const response = await context.request.delete(ACCOUNTS_URL);
  if (response.status() !== 200) {
    throw new Error(
      `Удаление аккаунта не удалось: ${response.status()} ${await response.text()}`,
    );
  }
}

type TrackedParticipant = {
  context: BrowserContext;
  user: TestUser;
  accountCreated: boolean;
};

export class UserRegistry {
  private tracked: TrackedParticipant[] = [];

  async add(browser: Browser, role: string): Promise<ParticipantSession> {
    const context = await browser.newContext();
    const user = makeUser(role, Date.now());
    const tracked: TrackedParticipant = { context, user, accountCreated: false };
    this.tracked.push(tracked);

    await createUserViaApi(context, user);
    tracked.accountCreated = true;

    const page = await context.newPage();
    return { user, context, page };
  }

  async addViaUi(browser: Browser, role: string): Promise<ParticipantSession> {
    const context = await browser.newContext();
    const user = makeUser(role, Date.now());
    const tracked: TrackedParticipant = { context, user, accountCreated: false };
    this.tracked.push(tracked);

    const page = await context.newPage();
    await registerViaUi(page, user);
    await page.waitForURL((url) => !url.pathname.includes("/auth/"), { timeout: 15_000 });
    tracked.accountCreated = true;

    return { user, context, page };
  }

  async cleanup(): Promise<void> {
    const batch = this.tracked.splice(0);
    const results = await Promise.allSettled(
      batch.map(async (participant) => {
        try {
          if (participant.accountCreated) {
            try {
              await deleteUserViaApi(participant.context);
            } catch {
              const page =
                participant.context.pages()[0] ?? (await participant.context.newPage());
              await logIn(page, participant.user.email, participant.user.password);
              await page.waitForURL((url) => !url.pathname.includes("/auth/"));
              await deleteUserViaApi(participant.context);
            }
          }
        } finally {
          await participant.context.close();
        }
      }),
    );
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      throw new Error(
        `Очистка участников не удалась: ${failed
          .map((result) => result.reason)
          .join("; ")}`,
      );
    }
  }
}
