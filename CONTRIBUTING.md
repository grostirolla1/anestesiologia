# Como contribuir

Conhecimento deve ser sempre livre, e este banco só melhora com revisão de quem estuda e pratica anestesiologia. Você não precisa saber programar para ajudar.

## Formas de ajudar

1. **Apontar um erro.** No site, cada explicação tem o link "Apontar erro nesta questão". Diga o que está errado e, se puder, a fonte.
2. **Revisar uma explicação.** As explicações foram escritas com apoio de IA e estão pendentes de revisão. Confira na literatura, corrija o texto e as referências.
3. **Escrever uma explicação** para uma questão que ainda não tem.
4. **Classificar o tema** de questões de prova que ainda não têm tema.
5. **Escrever questões novas.**

Para os itens 2 a 5, edite os arquivos pelo próprio GitHub (botão de lápis) ou clone o repositório, e abra um pull request.

## Regras de conteúdo

- **Escreva com suas palavras.** Não copie trechos de livros, apostilas, cursos ou bancos de questões pagos, nem parafraseie questão por questão o material deles.
- **Questões novas precisam ser de sua autoria.** Ao enviar, você declara que escreveu o conteúdo e aceita publicá-lo sob a licença do repositório.
- **Figuras:** desenhe as suas (SVG no próprio enunciado é o ideal). Não use imagens de livros, artigos ou cursos.
- **Questões de prova:** só aceitamos provas com origem identificada (banca, concurso, ano) e gabarito oficial. Indique os links.
- **Cite fontes de verdade.** Livro-texto e tema, ou diretriz e ano. Não invente página, edição ou artigo.
- **Nada de dados de pacientes reais.**

## Formato de uma questão

Os arquivos ficam em `data/provas/` (provas) e `data/originais/` (questões novas). Cada arquivo tem um cabeçalho e a lista `questoes`:

```json
{
  "id": 1000041,
  "descricao": "<p>Enunciado em HTML simples.</p>",
  "ano": "2026",
  "formato": "objetiva",
  "anulada": false,
  "dificuldade": "medio",
  "alternativas": [
    {"id": 10000411, "letra": "A", "descricao": "<p>Texto</p>", "isResposta": 0, "ordem": 1},
    {"id": 10000412, "letra": "B", "descricao": "<p>Texto</p>", "isResposta": 1, "ordem": 2}
  ],
  "origem": {"tipo": "original", "autoria": "Seu nome ou apelido"},
  "tema": "Via aérea e ventilação",
  "explicacao": "<p>Por que a correta está certa e as outras não.</p>",
  "referencias": ["Miller's Anesthesia, capítulo sobre manejo da via aérea"],
  "revisao": "pendente"
}
```

- `id`: número único no repositório. Questões originais usam a faixa a partir de 1000001; continue do último id do arquivo. O id de cada alternativa é o id da questão vezes 10, mais a ordem.
- `alternativas`: de 2 a 6, com letras A, B, C... em ordem, e exatamente uma com `isResposta: 1`.
- `dificuldade`: `facil`, `medio`, `dificil` ou `null`.
- `revisao`: `pendente` ou `revisada`. Ao revisar, troque para `revisada` e acrescente `"revisado_por": "seu nome"`.
- HTML permitido: `p`, `br`, `strong`, `em`, `sub`, `sup`, `ul`, `ol`, `li`, `table`, `figure`, `img` (só de `data/imagens/`) e SVG simples. O site descarta scripts, estilos e qualquer outra coisa.

## Explicações e temas de questões de prova

Para não mexer no texto das provas, explicações e temas ficam em `data/explicacoes/`, num arquivo com o mesmo nome do arquivo da prova, indexado pelo id da questão:

```json
{
  "2000123": {
    "tema": "Bloqueio neuromuscular",
    "explicacao": "<p>A succinilcolina é hidrolisada pela butirilcolinesterase plasmática [1].</p>",
    "referencias": ["Miller's Anesthesia, capítulo sobre bloqueadores neuromusculares"],
    "divergencia": null
  }
}
```

Toda explicação precisa de base na literatura. Marque no texto chamadas `[1]`, `[2]` logo depois da afirmação e liste as fontes em `referencias`, na mesma ordem: obra e capítulo, ou diretriz, sociedade e ano, com o link oficial quando houver. O site mostra as chamadas pequenas e a lista numerada. Escreva de forma clara, como quem explica a um colega, com a terminologia médica correta.

Use `divergencia` para registrar, em uma frase, quando a literatura atual não sustenta o gabarito oficial. A explicação deve seguir o gabarito e apontar a ressalva.

## Temas

Use exatamente um destes textos:

Farmacologia geral; Anestesia inalatória; Anestesia venosa; Bloqueio neuromuscular; Anestesia regional e anestésicos locais; Via aérea e ventilação; Sistema cardiovascular; Sistema respiratório; Neuroanestesia; Anestesia obstétrica; Anestesia pediátrica; Dor; Avaliação pré-anestésica e risco; Monitorização e equipamentos; Reposição volêmica, hemostasia e transfusão; Terapia intensiva e reanimação; Complicações e situações especiais; Ética, segurança e gestão.

## Antes de abrir o pull request (opcional)

Não precisa rodar nada: se você editou pelo próprio GitHub, abra o pull request e a revisão cuida do resto.

Se tiver o repositório clonado e Python instalado, pode rodar `python3 scripts/gerar_indice.py` na raiz. Ele confere o formato das questões, atualiza `data/indice.json` e regenera `ia/temas/`. Se apontar erro, corrija antes de enviar e inclua os arquivos gerados no pull request.

## Pedidos de remoção

Se você detém direitos sobre alguma questão e não quer que ela esteja aqui, abra uma issue com o título "Pedido de remoção" indicando a prova ou os ids. O conteúdo é removido sem discussão.
