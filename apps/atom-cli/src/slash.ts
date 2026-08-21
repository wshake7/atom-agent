export const SLASH_HELP = [
  "/exit",
  "/new",
  "/resume",
  "/session <id>",
  "/sessions",
  "/skill:<id>",
  "/skills",
  "/mcps",
  "/model",
  "/help",
] as const;

export interface SlashLine {
  readonly command: string;
  readonly rest: string;
}

export function parseSlash(text: string): SlashLine | undefined {
  if (!text.startsWith("/")) {
    return undefined;
  }
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!match) {
    return { command: "", rest: "" };
  }
  return { command: match[1] ?? "", rest: match[2]?.trim() ?? "" };
}

export function parseModelSlash(
  rest: string,
): { ok: true; id?: string; force: boolean; unforce: boolean } | { ok: false; error: string } {
  let id: string | undefined;
  let force = false;
  let unforce = false;
  if (rest.length > 0) {
    for (const token of rest.split(/\s+/)) {
      if (token === "--force") {
        force = true;
        continue;
      }
      if (token === "--unforce") {
        unforce = true;
        continue;
      }
      if (token.startsWith("-")) {
        return { ok: false, error: `未知参数: ${token}` };
      }
      if (id) {
        return { ok: false, error: "/model 参数过多" };
      }
      id = token;
    }
  }
  if (force && unforce) {
    return { ok: false, error: "/model --force 与 --unforce 不能同时使用" };
  }
  if (unforce && id) {
    return { ok: false, error: "/model --unforce 不接受模型 id" };
  }
  return { ok: true, id, force, unforce };
}
