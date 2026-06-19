# ▶️ Como usar o site do vídeo da Copa (com suas imagens de IA)

Tudo roda **offline** no seu computador. Nada é enviado para a internet.

---

## 🚀 Jeito recomendado (imagens carregam sozinhas + exportação funciona)

1. Salve suas **imagens geradas por IA** na pasta `Projeto_Copa_IA/04_Imagens/` com **estes nomes exatos**:

   | Cena | Nome do arquivo |
   |---|---|
   | Estádio | `estadio.jpg` |
   | Torcedores | `torcedores.jpg` |
   | Jogadores | `jogadores.jpg` |
   | Gol | `gol.jpg` |
   | Taça | `taca.jpg` |
   | Comemoração | `comemoracao.jpg` |

   *(pode ser `.jpg`, `.png` ou `.webp`. Não precisa ter todas — as que faltarem viram cena desenhada.)*

2. Na pasta `Projeto_Copa_IA/`, **dê duplo clique em `INICIAR_VIDEO.bat`**.
   - Abre uma janela preta (o servidor) — **não feche** enquanto usar.
   - O navegador abre sozinho em `http://localhost:8000/site/index.html`.
   - As imagens da pasta `04_Imagens/` são **carregadas automaticamente** em cada cena.

3. Clique **▶ Reproduzir** e depois **🎬 Exportar vídeo**.

> Precisa do **Node.js** instalado (você já tem). Para parar, feche a janela preta.

---

## 🖱️ Jeito simples (sem servidor)

Dê duplo clique em `site/index.html`. Funciona para ver e exportar, mas aí você carrega as imagens **manualmente** pelo painel da direita (e a exportação com imagens só é garantida pelo `INICIAR_VIDEO.bat`).

---

## ⚠️ MUITO IMPORTANTE — quais imagens usar

- ✅ **Use imagens geradas por IA** (o trabalho exige isso). As que você já gerou (estádio e torcida) são perfeitas — salve como `estadio.jpg` e `torcedores.jpg`.
- ❌ **NÃO use fotos de jogadores reais baixadas do Google**, nem o card oficial de "Convocação" da CBF/FIFA. Motivos:
  1. O enunciado pede **imagens geradas por IA** — material oficial não conta e pode tirar pontos.
  2. São **protegidos por direitos autorais e marca registrada** (fotos de agências, logos CBF e FIFA).
- ✅ Para os jogadores, **gere por IA** (sem rostos reais e sem logos), ex.:
  > *"Jogadores de futebol em ação, driblando e chutando, uniforme amarelo e verde, estádio ao fundo, iluminação dramática, cinematográfico, ultra realista, 4K"*

**Geradores de IA grátis:** Bing Image Creator (bing.com/create) · Google ImageFX (labs.google/fx) · Leonardo.ai

---

## 🎬 Sobre o vídeo exportado
- Salva em **MP4** quando o navegador suporta; senão, em **WebM** (converta em cloudconvert.com ou no VLC).
- O site aplica em cima das suas fotos um *grade* cinematográfico (zoom, brilho, grão de filme, vinheta) — fica com cara de filme.

## 🔊 Narração no arquivo
- A **voz do navegador** toca ao vivo, mas **não entra na gravação**.
- Para tê-la no MP4: gere a narração em **MP3** (ElevenLabs, ver `06_Naracao`) e carregue em **Áudio → Narração (MP3)**. A música é sempre gravada.

> Navegador recomendado: **Google Chrome** ou **Microsoft Edge** atualizados.
