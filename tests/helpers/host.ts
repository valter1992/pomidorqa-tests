import { type Page } from "@playwright/test";
import { BookingPage } from "../pages/booking-page";

// Подготовка хоста со стороны слотов: без будущего свободного слота участник
// не попадает в каталог, поэтому хост для сценариев каталога и бронирования
// поднимается целиком — аккаунт заводит спека через API, навык добавляется
// на профиле, слот здесь.

export async function addOpenSlot(page: Page, slotDate: string): Promise<void> {
  const booking = new BookingPage(page);
  await booking.openSlots();
  await booking.addSlot(slotDate, "12:00");
}
