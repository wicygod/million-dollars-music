import { ApiRequestError } from "../api/musicApi";

export type AuthMode = "login" | "register";

function validationFields(detail: unknown): Set<string> {
  if (!Array.isArray(detail)) return new Set();
  return new Set(detail.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const location = (item as { loc?: unknown }).loc;
    if (!Array.isArray(location)) return [];
    const field = location[location.length - 1];
    return typeof field === "string" ? [field] : [];
  }));
}

function detailText(detail: unknown): string {
  if (typeof detail === "string") return detail.toLowerCase();
  if (!Array.isArray(detail)) return "";
  return detail.map((item) => {
    if (!item || typeof item !== "object") return "";
    return String((item as { msg?: unknown }).msg || "");
  }).join(" ").toLowerCase();
}

export function authFailureMessage(error: unknown, mode: AuthMode): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Сервер отвечает слишком долго. Проверьте подключение и попробуйте снова.";
  }
  if (error instanceof TypeError) {
    return "Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.";
  }
  if (!(error instanceof ApiRequestError)) {
    return mode === "register"
      ? "Не удалось завершить регистрацию. Попробуйте снова."
      : "Не удалось войти. Попробуйте снова.";
  }

  if (error.status === 409 && mode === "register") {
    return "Этот логин уже занят. Попробуйте войти или выберите другой логин.";
  }
  if (error.status === 429) {
    return "Слишком много попыток. Подождите немного и попробуйте снова.";
  }
  if (error.status === 401) {
    return mode === "login"
      ? "Неверный логин или пароль. Проверьте данные и попробуйте снова."
      : "Сервер не принял эту версию приложения. Обновите приложение и попробуйте снова.";
  }
  if (error.status === 422) {
    const fields = validationFields(error.detail);
    const text = detailText(error.detail);
    const messages: string[] = [];
    if (fields.has("login") || text.includes("login")) {
      messages.push("Логин: 3–64 символа, только латинские буквы, цифры, точка, дефис и подчёркивание.");
    }
    if (fields.has("nickname") || text.includes("nickname")) {
      messages.push("Имя в приложении: от 2 до 96 символов.");
    }
    if (fields.has("password") || text.includes("password")) {
      messages.push("Пароль: от 6 до 128 символов.");
    }
    return messages.join(" ") || "Проверьте формат введённых данных.";
  }
  if (error.status >= 500) {
    return "Сервер временно не может создать аккаунт. Попробуйте ещё раз через минуту.";
  }
  return mode === "register"
    ? "Не удалось создать аккаунт. Проверьте данные и попробуйте снова."
    : "Не удалось войти. Проверьте логин и пароль.";
}
