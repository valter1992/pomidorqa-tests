import { expect, type Locator, type Page } from "@playwright/test";

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
  readonly personCanHelpSection: Locator;
  readonly personWantToLearnSection: Locator;

  readonly calendarDay: Locator;
  readonly calendarTime: Locator;

  readonly confirmDialog: Locator;
  readonly confirmButton: Locator;
  readonly confirmSuccess: Locator;
  readonly confirmError: Locator;

  readonly bookingsUpcomingSection: Locator;

  readonly bookingsPastSection: Locator;

  constructor(readonly page: Page) {
    this.slotsDateInput = page.locator("#pomidorqa-slots-date");
    this.slotsTimeInput = page.locator("#pomidorqa-slots-time");
    this.slotsAddSubmit = page.getByRole("button", { name: "Добавить слот" });
    this.slotsCard = page.locator("[data-slot-id]");

    this.catalogFilterInput = page.locator("#pomidorqa-catalog-skill-filter");
    this.catalogFilterSubmit = page.getByRole("button", { name: "Найти" });

    this.personCards = page.getByTestId("person-card");
    this.catalogEmpty = page.getByText("Пока никого не нашли");

    this.personName = page.getByRole("heading", { level: 1 });
    this.personCanHelpSection = page.getByText(/может помочь с/i).locator("..");
    this.personWantToLearnSection = page.getByText(/хочет разобрать/i).locator("..");

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

  slotByDate(date: string): Locator {
    return this.slotsCard.filter({ hasText: date });
  }

  async removeSlot(index: number) {
    await this.slotsCard.nth(index).getByRole("button", { name: "Удалить" }).click();
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

  async ensureCalendarLoaded() {
    if (!(await this.calendarDay.first().isVisible().catch(() => false))) {
      await this.page.reload();
    }
  }

  async selectFirstSlot() {
    await this.calendarDay.first().click();
    await expect(async () => {
      if (await this.confirmDialog.isVisible().catch(() => false)) return;
      await this.calendarTime.first().click();
      await expect(this.confirmDialog).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
  }

  async confirmBooking() {
    await this.confirmButton.click();
  }

  async bookFirstSlot(skillTag: string, hostName: string) {
    await this.openCatalog();
    await this.searchInCatalog(skillTag);
    await this.personCardByName(hostName).click();
    await expect(this.personName).toHaveText(hostName);
    await expect(async () => {
      await this.ensureCalendarLoaded();
    }).toPass({ timeout: 10_000 });
    await this.selectFirstSlot();
    await expect(this.confirmDialog).toBeVisible();
    await this.confirmBooking();
    await expect(this.confirmSuccess).toBeVisible({ timeout: 15_000 });
  }

  async closeConfirmDialog() {
    await this.confirmDialog.getByRole("button", { name: "Отмена" }).click();
  }

  async openBookings() {
    await this.page.goto(BOOKINGS_URL);
  }

  async openBookingsUntilCardVisible(participantName: string) {
    await this.openBookings();
    if (!(await this.bookingCardByName(participantName).isVisible().catch(() => false))) {
      await this.page.reload();
    }
  }

  async cancelBooking(participantName: string) {
    const card = this.bookingCardByName(participantName);
    await card.getByRole("button", { name: "Отменить" }).click();
  }

  async reload() {
    await this.page.reload();
  }
}
