import { expect, type Page } from "@playwright/test";
import { BookingPage } from "../pages/booking-page";
import { ProfilePage } from "../pages/profile-page";

export async function addOpenSlot(page: Page, slotDate: string, slotTime = "12:00"): Promise<void> {
  const booking = new BookingPage(page);
  await booking.openSlots();
  await booking.addSlot(slotDate, slotTime);
}

export async function prepareHost(page: Page, skillTag: string): Promise<void> {
  const profile = new ProfilePage(page);
  await profile.open();
  await profile.addSkill(skillTag, "can_help");
  await expect(profile.canHelpSkills).toContainText(skillTag);

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await addOpenSlot(page, tomorrow.toISOString().slice(0, 10));
  const booking = new BookingPage(page);
  await expect(booking.slotsCard.first()).toBeVisible();
}
