import tseslint from "typescript-eslint";
import playwright from "eslint-plugin-playwright";

const playwrightRecommended = playwright.configs["flat/recommended"];

export default tseslint.config(
  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.recommended],
  },
  {
    ...playwrightRecommended,
    files: ["tests/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      ...playwrightRecommended.rules,
      // Фиксированная пауза замедляет тест и маскирует неправильное ожидание состояния.
      "playwright/no-wait-for-timeout": "error",
      // `force` обходит проверки Playwright и часто скрывает проблему UI или локатора.
      "playwright/no-force-option": "error",
      // Забытый `await` создаёт гонки и ложные результаты теста.
      "playwright/missing-playwright-await": "error",
      // Закомментированный тест — мёртвый код; его предыдущую версию уже хранит Git.
      "playwright/no-commented-out-tests": "error",
      // `page.pause()` остановит и в итоге завесит автоматический CI-прогон.
      "playwright/no-page-pause": "error",
      // `test.only` может дать зелёный CI, запустив один тест вместо полного набора.
      "playwright/no-focused-test": "error",
      // Сценарий без `expect` выполняет действия, но не подтверждает результат.
      "playwright/expect-expect": "error",
      // Существующие тесты содержат условия; их рефакторинг — отдельная задача.
      "playwright/no-conditional-in-test": "off",
      // Правила ниже форматируют код, но не ловят флаки — не переписываем ради стиля.
      "playwright/consistent-spacing-between-blocks": "off",
      "playwright/no-useless-not": "off",
      "playwright/valid-title": "off",
    },
  },
);
