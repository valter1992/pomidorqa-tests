import {
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

// Подготовка идёт через API — служебная ручка /test/accounts заводит и удаляет
// аккаунт, браузер остаётся только для действий, которые проверяет сам сценарий.

const LOGIN_URL = "/pomidorqa/auth/login";
const ACCOUNTS_URL = "/api/pomidorqa/test/accounts";

export type TestUser = {
  name: string;
  email: string;
  password: string;
};

// Участник вместе с его браузерным контекстом. DELETE аккаунта не принимает
// id: сервер удаляет владельца пришедшей сессионной куки, поэтому удалить
// аккаунт можно только из того контекста, где прошла регистрация.
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
    // Имя с уникальным хвостом: сценарии ищут карточки и встречи по имени
    // участника, а «host Автотест» на общем стенде не один.
    name: `${role} Автотест ${randomSuffix()}`,
    // Почте случайный хвост нужен не меньше имени: параллельные воркеры,
    // стартовавшие в одну миллисекунду, получат одинаковый runId, и стенд
    // ответит второму 409 email_taken.
    email: `${role}-${runId}-${randomSuffix()}@example.com`,
    password: "testpass123",
  };
}

// Уникальный тег навыка: выдача каталога фильтруется по нему, совпадение
// с чужим тегом притащило бы в результаты постороннего хоста.
export function uniqueTag(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomSuffix()}`;
}

// Локаторы формы входа — локальные: наружу торчит только функция,
// отдельной страницы входа в проекте нет.
export async function logIn(page: Page, email: string, password: string) {
  await page.goto(LOGIN_URL);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

// Регистрация через API: POST оставляет сессионную куку в общем хранилище
// контекста, поэтому страница, открытая из этого же контекста, уже авторизована —
// отдельный вход не нужен.
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

// Удаление каскадное: вместе с аккаунтом уходят его навыки, слоты и брони,
// так что следующий прогон стартует с чистого состояния.
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
  accountCreated: boolean;
};

// Все участники, заведённые текущим тестом: спека складывает их сюда по мере
// создания, а afterEach одним cleanup() разбирает всех — даже если сценарий
// упал на середине.
export class UserRegistry {
  private tracked: TrackedParticipant[] = [];

  // Контекст попадает в список до регистрации: если POST упадёт, cleanup всё
  // равно закроет контекст. Флаг отличает «аккаунт не создан, удалять нечего»
  // от живого аккаунта — лишний DELETE ответил бы 401 и подменил бы настоящую
  // причину падения теста.
  async add(browser: Browser, role: string): Promise<ParticipantSession> {
    const context = await browser.newContext();
    const tracked: TrackedParticipant = { context, accountCreated: false };
    this.tracked.push(tracked);

    const user = await createUserViaApi(context, makeUser(role, Date.now()));
    tracked.accountCreated = true;

    // Страница остаётся на about:blank — какой адрес открывать, решает спека:
    // хосту нужен профиль, гостю — каталог.
    const page = await context.newPage();
    return { user, context, page };
  }

  // Список забирается целиком до разбора: что бы ни случилось при удалении,
  // реестр пустеет и следующий тест не полезет удалять уже чужие аккаунты.
  async cleanup(): Promise<void> {
    const batch = this.tracked.splice(0);
    const results = await Promise.allSettled(
      batch.map(async (participant) => {
        try {
          if (participant.accountCreated) {
            await deleteUserViaApi(participant.context);
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
