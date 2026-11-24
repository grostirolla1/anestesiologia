#!/usr/bin/env python3
"""Valida os arquivos de questões e gera data/indice.json, que o site carrega ao abrir.

Rode da raiz do repositório sempre que adicionar ou editar questões:

    python3 scripts/gerar_indice.py

O script falha (código 1) se encontrar questão fora do formato descrito em CONTRIBUTING.md.
"""
import glob
import html
import json
import os
import re
import sys
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)

TEMAS = [
    "Farmacologia geral", "Anestesia inalatória", "Anestesia venosa", "Bloqueio neuromuscular",
    "Anestesia regional e anestésicos locais", "Via aérea e ventilação", "Sistema cardiovascular",
    "Sistema respiratório", "Neuroanestesia", "Anestesia obstétrica", "Anestesia pediátrica", "Dor",
    "Avaliação pré-anestésica e risco", "Monitorização e equipamentos",
    "Reposição volêmica, hemostasia e transfusão", "Terapia intensiva e reanimação",
    "Complicações e situações especiais", "Ética, segurança e gestão",
]
PROIBIDO = re.compile(r"<\s*(script|iframe|object|embed|style|link)\b|<[^>]*\son\w+\s*=|javascript:", re.I)
erros, avisos = [], []


def confere(q, arquivo, ids):
    onde = "%s, questão %s" % (arquivo, q.get("id"))
    if not isinstance(q.get("id"), int):
        erros.append(onde + ": 'id' precisa ser número inteiro")
        return
    if q["id"] in ids:
        erros.append(onde + ": id repetido (também em %s)" % ids[q["id"]])
    ids[q["id"]] = arquivo
    if not (q.get("descricao") or "").strip():
        erros.append(onde + ": enunciado vazio")
    alts = q.get("alternativas") or []
    if not 2 <= len(alts) <= 6:
        erros.append(onde + ": precisa ter de 2 a 6 alternativas")
    letras = [a.get("letra") for a in alts]
    if letras != list("ABCDEF"[:len(alts)]):
        erros.append(onde + ": letras das alternativas devem ser A, B, C... em ordem")
    certas = sum(1 for a in alts if a.get("isResposta"))
    if certas != 1 and not q.get("anulada"):
        avisos.append(onde + ": %d alternativas marcadas como corretas (a questão fica fora dos simulados)" % certas)
    tudo = (q.get("descricao") or "") + "".join(a.get("descricao") or "" for a in alts) + (q.get("explicacao") or "")
    if PROIBIDO.search(tudo):
        erros.append(onde + ": HTML não permitido (script, style, eventos ou links javascript)")
    for src in re.findall(r"<img[^>]*\ssrc=\"([^\"]*)\"", tudo):
        if not src.startswith("data/imagens/") or not os.path.exists(src):
            erros.append(onde + ": imagem ausente ou fora de data/imagens/: " + src)
    if q.get("tema") and q["tema"] not in TEMAS:
        erros.append(onde + ": tema desconhecido: " + q["tema"])


fontes, questoes, ids = [], [], {}
por_tema = {t: [] for t in TEMAS}   # para os arquivos de estudo com IA
for tipo, pasta in (("prova", "data/provas"), ("original", "data/originais")):
    for arquivo in sorted(glob.glob(pasta + "/*.json")):
        try:
            dados = json.load(open(arquivo, encoding="utf-8"))
        except ValueError as e:
            erros.append("%s: JSON inválido (%s)" % (arquivo, e))
            continue
        cab = dados.get("prova") or dados.get("lote") or {}
        slug = cab.get("slug") or os.path.splitext(os.path.basename(arquivo))[0]
        exp_arquivo = "data/explicacoes/%s.json" % slug
        explicacoes = {}
        if os.path.exists(exp_arquivo):
            try:
                explicacoes = json.load(open(exp_arquivo, encoding="utf-8"))
            except ValueError as e:
                erros.append("%s: JSON inválido (%s)" % (exp_arquivo, e))
        for chave, e in explicacoes.items():
            if e.get("tema") and e["tema"] not in TEMAS:
                erros.append("%s, %s: tema desconhecido: %s" % (exp_arquivo, chave, e["tema"]))
            if PROIBIDO.search(e.get("explicacao") or ""):
                erros.append("%s, %s: HTML não permitido" % (exp_arquivo, chave))
        if tipo == "original":
            serie, titulo = "Questões originais", cab.get("descricao") or slug
        elif cab.get("banca") == "FGV":
            serie, titulo = "Concursos (FGV)", "%s, %s" % (cab.get("titulo") or cab.get("concurso") or slug, cab.get("ano"))
        else:
            serie, titulo = cab.get("concurso") or "Outras provas", cab.get("titulo") or slug
        indice_fonte = len(fontes)
        n = 0
        for q in dados.get("questoes", []):
            antes = len(erros)
            confere(q, arquivo, ids)
            if len(erros) > antes:
                continue
            certas = sum(1 for a in q["alternativas"] if a.get("isResposta"))
            if certas != 1 and not q.get("anulada"):
                continue
            tema = q.get("tema") or (explicacoes.get(str(q["id"])) or {}).get("tema")
            e = explicacoes.get(str(q["id"])) or {}
            tem_exp = bool(q.get("explicacao") or e.get("explicacao"))
            tudo = q["descricao"] + "".join(a["descricao"] for a in q["alternativas"])
            questoes.append([q["id"], indice_fonte, TEMAS.index(tema) if tema in TEMAS else -1,
                             1 if ("<img" in tudo or "<svg" in tudo) else 0, 1 if tem_exp else 0])
            n += 1
            if tema in TEMAS and tem_exp and "<img" not in tudo and "<svg" not in tudo:
                por_tema[tema].append((str(cab.get("ano") or q.get("ano") or ""), titulo, q, {
                    "explicacao": q.get("explicacao") or e.get("explicacao"),
                    "referencias": q.get("referencias") or e.get("referencias") or [],
                    "divergencia": q.get("divergencia") or e.get("divergencia")}))
        fontes.append({"slug": slug, "arquivo": arquivo, "tipo": tipo, "serie": serie, "titulo": titulo,
                       "banca": cab.get("banca"), "ano": cab.get("ano"), "n": n,
                       "ordem_da_prova": cab.get("banca") == "FGV",
                       "explicacoes": exp_arquivo if explicacoes else None})

for a in avisos[:20]:
    print("aviso:", a)
if erros:
    for e in erros[:60]:
        print("ERRO:", e)
    print("\n%d erro(s). O índice não foi gerado." % len(erros))
    sys.exit(1)


# ---------- arquivos em markdown para o "Estudar com IA" (ia/temas/) ----------
POR_PARTE = 20


def slug_de(texto):
    s = unicodedata.normalize("NFD", texto.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def texto_de(h):
    h = re.sub(r"<\s*(br|/p|/li|/tr|/h\d)\s*/?>", "\n", h or "", flags=re.I)
    h = re.sub(r"<\s*li[^>]*>", "- ", h, flags=re.I)
    h = html.unescape(re.sub(r"<[^>]+>", "", h)).replace("\xa0", " ")
    return re.sub(r"\n\s*\n+", "\n", re.sub(r"[ \t]+", " ", h)).strip()


for velho in glob.glob("ia/temas/*.md"):
    os.remove(velho)
os.makedirs("ia/temas", exist_ok=True)
slugs, partes = [slug_de(t) for t in TEMAS], []
geral = ["# Questões por tema", "",
         "Banco aberto de questões de anestesiologia. Cada tema tem um índice que aponta para arquivos com "
         "%d questões de prova, gabarito e explicação com referências. Os endereços são relativos a este arquivo." % POR_PARTE, ""]
for tema, slug in zip(TEMAS, slugs):
    itens = sorted(por_tema[tema], key=lambda x: (x[0], x[2]["id"]), reverse=True)
    blocos = [itens[i:i + POR_PARTE] for i in range(0, len(itens), POR_PARTE)]
    partes.append(len(blocos))
    geral.append("- [%s](%s.md): %d questões" % (tema, slug, len(itens)))
    cab_tema = ["# %s" % tema, "", "%d questões de prova com gabarito e explicação, das mais recentes para as mais antigas. "
                "Abra uma parte por vez; os endereços são relativos a este arquivo." % len(itens), ""]
    for i, bloco in enumerate(blocos, 1):
        nome = "%s-%02d.md" % (slug, i)
        anos = sorted(set(b[0] for b in bloco if b[0]))
        cab_tema.append("- [Parte %d](%s): %d questões%s" % (i, nome, len(bloco), (", provas de %s a %s" % (anos[0], anos[-1])) if anos else ""))
        linhas = ["# %s, parte %d de %d" % (tema, i, len(blocos)), "",
                  "Ao usar com um aluno: apresente o enunciado e as alternativas, espere a resposta e só então mostre gabarito e explicação.", ""]
        for ano, titulo, q, e in bloco:
            linhas += ["## Questão %d (%s)" % (q["id"], titulo), "", texto_de(q["descricao"]), ""]
            linhas += ["%s) %s" % (a["letra"], texto_de(a["descricao"])) for a in q["alternativas"]]
            certa = next((a["letra"] for a in q["alternativas"] if a.get("isResposta")), None)
            linhas += ["", "**Gabarito:** %s" % ("anulada pela banca" if q.get("anulada") else certa), "", "**Explicação:** " + texto_de(e["explicacao"]), ""]
            if e["divergencia"]:
                linhas += ["**Atenção ao gabarito:** " + e["divergencia"], ""]
            if e["referencias"]:
                linhas += ["**Referências:**"] + ["%d. %s" % (k, r) for k, r in enumerate(e["referencias"], 1)] + [""]
        open("ia/temas/" + nome, "w", encoding="utf-8").write("\n".join(linhas))
    open("ia/temas/%s.md" % slug, "w", encoding="utf-8").write("\n".join(cab_tema) + "\n")
open("ia/temas/indice.md", "w", encoding="utf-8").write("\n".join(geral) + "\n")

json.dump({"temas": TEMAS, "ia": {"slugs": slugs, "partes": partes}, "fontes": fontes, "questoes": questoes},
          open("data/indice.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
com_tema = sum(1 for q in questoes if q[2] >= 0)
com_exp = sum(1 for q in questoes if q[4])
print("índice gerado: %d questões em %d arquivos | com tema: %d | com explicação: %d | avisos: %d"
      % (len(questoes), len(fontes), com_tema, com_exp, len(avisos)))
