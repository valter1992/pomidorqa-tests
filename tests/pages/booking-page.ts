import { expect, type Locator, type Page } from "@playwright/test";

// Один класс на весь путь: слоты хоста → каталог → карточка человека →
// календарь → диалог подтверждения → «Мои встречи».
// Пользователь и вход — в helpers/user.ts.

const CATALOG_URL = "/pomidorqa";
const SLOTS_URL = "/pomidorqa/profile/slots";
const BOOKINGS_URL = "/pomidorqa/bookings";

export class BookingPage {
  readonly slotsDateInput: Locator;
  readonly slotsTimeInput: Locator;
  readonly slotsAddSubmit: Locator;
  readonly slotsCard: Locator;

  readonly catalogFilterInput: Locator;
  readonly catalogFilterSubmit: Locator;

  readonly personCards: Locator;
  readonly catalogEmpty: Locator;

  readonly personName: Locator;

  readonly calendarDay: Locator;
  readonly calendarTime: Locator;

  readonly confirmDialog: Locator;
  readonly confirmButton: Locator;
  readonly confirmSuccess: Locator;
  readonly confirmError: Locator;

  // «Мои встречи»: секция «Ближайшие» — предстоящие встречи
  readonly bookingsUpcomingSection: Locator;

  // «Мои встречи»: секция «Прошедшие и отменённые» — сюда карточка
  // попадает после отмены встречи
  readonly bookingsPastSection: Locator;

  constructor(private readonly page: Page) {
    this.slotsDateInput = page.locator("#pomidorqa-slots-date");
    this.slotsTimeInput = page.locator("#pomidorqa-slots-time");
    this.slotsAddSubmit = page.getByRole("button", { name: "Добавить слот" });
    this.slotsCard = page.locator("[data-slot-id]");

    this.catalogFilterInput = page.locator("#pomidorqa-catalog-skill-filter");
    this.catalogFilterSubmit = page.getByRole("button", { name: "Найти" });

    // У пустой выдачи нет testid — единственный якорь текст плейсхолдера.
    this.personCards = page.getByTestId("person-card");
    this.catalogEmpty = page.getByText("Пока никого не нашли");

    this.personName = page.getByRole("heading", { level: 1 });

    this.calendarDay = page.getByRole("group", { name: "Дни со слотами" }).getByRole("button");
    this.calendarTime = page.getByRole("group", { name: "Время слотов" }).getByRole("button");

    this.confirmDialog = page.getByRole("dialog");
    this.confirmButton = page.getByRole("dialog").getByRole("button", { name: "Подтвердить" });
    this.confirmSuccess = page.getByRole("dialog").getByRole("status");
    this.confirmError = page.getByRole("dialog").getByRole("alert");

    this.bookingsUpcomingSection = page.getByTestId("upcoming-meetings");
    this.bookingsPastSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Прошедшие и отменённые" }) });
  }

  personCardByName(name: string): Locator {
    return this.personCards.filter({ hasText: name });
  }

  // Карточка встречи по имени второго участника: гость ищет по имени хоста,
  // хост — по имени гостя. Без .first(): имена уникальны за счёт runId,
  // и тесту важна именно его встреча, а не чужая с общего стенда.
  bookingCardByName(participantName: string): Locator {
    return this.bookingsUpcomingSection
      .locator("[data-booking-id]")
      .filter({ hasText: participantName });
  }

  pastCardByName(participantName: string): Locator {
    return this.bookingsPastSection
      .locator("[data-booking-id]")
      .filter({ hasText: participantName });
  }

  async openSlots() {
    await this.page.goto(SLOTS_URL);
  }

  async addSlot(date: string, time: string) {
    await this.slotsDateInput.fill(date);
    await this.slotsTimeInput.fill(time);
    await this.slotsAddSubmit.click();
  }

  async openCatalog() {
    await this.page.goto(CATALOG_URL);
  }

  async searchInCatalog(skillTag: string) {
    await this.catalogFilterInput.fill(skillTag);
    await this.catalogFilterSubmit.click();
  }

  async openPersonCard(name: string) {
    await this.personCardByName(name).click();
  }

  // Календарь на карточке догидратируется не сразу: если дней ещё нет —
  // перезагружаем страницу. Повторные попытки делает toPass в спеке.
  async ensureCalendarLoaded() {
    if (!(await this.calendarDay.first().isVisible().catch(() => false))) {
      await this.page.reload();
    }
  }

  async selectFirstSlot() {
    await this.calendarDay.first().click();
    // Клик по времени может уйти в DOM до гидратации карточки или в узел,
    // который React перевешивает после выбора дня, — событие теряется и диалог
    // не открывается. Поэтому проверяем результат клика и повторяем его,
    // а не ждём дольше: после потерянного клика диалог не откроется никогда.
    await expect(async () => {
      if (await this.confirmDialog.isVisible().catch(() => false)) return;
      await this.calendarTime.first().click();
      await expect(this.confirmDialog).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
  }

  async confirmBooking() {
    await this.confirmButton.click();
  }

  async openBookings() {
    await this.page.goto(BOOKINGS_URL);
  }

  // Встреча появляется в «Моих встречах» не сразу после подтверждения:
  // если карточки ещё нет — перезагружаем страницу, список приходит
  // при загрузке. Повторные попытки делает toPass в спеке.
  async openBookingsUntilCardVisible(participantName: string) {
    await this.openBookings();
    if (!(await this.bookingCardByName(participantName).isVisible().catch(() => false))) {
      await this.page.reload();
    }
  }

  // Кнопка «Отменить» ищется внутри карточки, а не на всей странице —
  // в списке может быть несколько встреч, у каждой своя кнопка.
  async cancelBooking(participantName: string) {
    const card = this.bookingCardByName(participantName);
    await card.getByRole("button", { name: "Отменить" }).click();
  }

  async reload() {
    await this.page.reload();
  }
}
