import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { obterDb } from "@/db";
import { sessoes, usuarios } from "@/db/schema";

const COOKIE = "urutau_sessao";
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

export const hashSenha = (senha: string) => hash(senha);
export const conferirSenha = (senhaHash: string, senha: string) => verify(senhaHash, senha);

/** Senha provisória para o painel Urutau entregar ao cliente: sem letras que se confundem (0/O, 1/l). */
export function gerarSenhaProvisoria(tamanho = 10) {
  const alfabeto = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: tamanho }, () => alfabeto[randomInt(alfabeto.length)]).join("");
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function iniciarSessao(usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + DURACAO_MS);
  await obterDb().insert(sessoes).values({ tokenHash: hashToken(token), usuarioId, expiraEm });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiraEm,
  });
}

export async function encerrarSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await obterDb().delete(sessoes).where(eq(sessoes.tokenHash, hashToken(token)));
  jar.delete(COOKIE);
}

export type UsuarioAtual = { id: string; nome: string; email: string; superadmin: boolean };

export const obterUsuarioAtual = cache(async (): Promise<UsuarioAtual | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [linha] = await obterDb()
    .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, superadmin: usuarios.superadmin })
    .from(sessoes)
    .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
    .where(and(eq(sessoes.tokenHash, hashToken(token)), gt(sessoes.expiraEm, new Date())))
    .limit(1);
  return linha ?? null;
});

export async function exigirUsuario(): Promise<UsuarioAtual> {
  const u = await obterUsuarioAtual();
  if (!u) redirect("/entrar");
  return u;
}
