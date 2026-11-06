# Format Painter BR v2.0.9 — correção de instalação e ciclo de vida

**Atenção:** este ZIP é o **projeto-fonte**, não o arquivo a instalar diretamente no RemNote. O RemNote exige um pacote **PluginZip.zip** com `manifest.json`, `index.html` e JavaScript compilado na raiz.

**Windows (um clique):** extraia o projeto, abra a pasta e execute `GERAR-PLUGIN-WINDOWS.bat`. O script instala as dependências via npm, executa os testes e gera `PluginZip.zip`. No RemNote abra **Configurações → Plugins → Build/Developer → Upload/Install from ZIP**, e escolha **somente o `PluginZip.zip` gerado**, não o projeto-fonte.

**GitHub:** envie os arquivos para a **raiz** do repositório; a ação `Compilar plugin RemNote` ficará disponível na aba **Actions**. Execute `Run workflow` e baixe o artefato `Format-Painter-BR-v2.0.9-PluginZip`, contendo o `PluginZip.zip` instalável.

**v2.0.9:** remove escrita excessiva de seleção no armazenamento, encerra o temporizador e listener na desativação, preserva a preferência de ocultar a barra e impede que um erro de notificação seja confundido com falha de formatação. Mantém as medidas de integridade de seleção da v2.0.8.

# Format Painter BR 2.0.8 — realce personalizado visível (predefinido mais próximo)

- Conclusão dos testes: o RemNote **não aceita que plugins gravem destaque personalizado** (recusa o hexadecimal; o número RGB era aceito mas ficava invisível). O atributo `decorations` não carrega cor (vem só `{"last_rich_text_item":true}`).
- O número RGB invisível foi removido. Agora, se o RemNote recusar o hexadecimal, o plugin aplica o **realce predefinido mais próximo pelo matiz** (Red, Orange, Yellow, Green, Blue, Purple) e avisa. Cores acinzentadas não têm equivalente: o realce é descartado, com aviso.
- Cor do texto (personalizada ou não) e realces predefinidos continuam exatos.

# Format Painter BR 2.0.7 — `decorations`

- Dado dos avisos: a palavra de origem traz `h`, `tc` e um atributo novo, **`decorations`**, que o plugin não copiava. O RemNote só aceitou o realce gravado como número RGB (`h=20478`).
- Agora `decorations` é copiado e enviado junto com o realce (formato original primeiro). Se o RemNote o recusar, o plugin cai nas formas anteriores, sem perder texto.
- O aviso de **Copiar** mostra o conteúdo de `decorations` (cores, sem o seu texto) e o **?** também.

# Format Painter BR 2.0.6 — realce personalizado: id próprio e leitura de volta

- Comparação com a cor do texto: `tc` e `h` passam exatamente pelo mesmo código; a diferença está nos dados. O realce personalizado traz um `elementId` que a cor do texto não traz.
- Ao aplicar, o plugin gera um **elementId novo no mesmo formato** do copiado (para não duplicar o id do realce de origem).
- O aviso de **Aplicar** termina com a **leitura de volta**: o que o RemNote realmente guardou (`h=…`, formato do `elementId` com letras e números mascarados). O botão **?** mostra o formato do `elementId` da seleção.

# Format Painter BR 2.0.5 — realce personalizado: elementId viaja junto e a gravação é verificada

- Relato: o plugin dizia que aplicou, mas o realce personalizado não aparecia. Os avisos mostraram que o realce personalizado vem como `h:"#rrggbb"` acompanhado de um `elementId`; antes o plugin copiava só o `h`, que o RemNote aceitava e ignorava.
- Agora o `elementId` é copiado junto com o `h` e aplicado junto. O `elementId` do destino nunca é mantido quando o formato copiado não tem realce.
- Depois de gravar, o plugin **lê o texto de volta** e confere se o realce ficou salvo. Se o RemNote aceitou mas não guardou, tenta as outras formas e, no fim, avisa com o motivo, em vez de fingir sucesso.

# Format Painter BR 2.0.4 — realce personalizado: mais formas e motivo no aviso

- A substituição segura agora também testa, nesta ordem: realce como veio, **com o `elementId` original** (caso o RemNote o exija) e **via markdown** (o RemNote converte o texto formatado), antes das formas aproximadas.
- Quando o realce precisa ser descartado, o aviso inclui o **Motivo** (erro de cada tentativa).
- O botão **?** mostra a linha "6b markdown" (letras e números mascarados), que revela se o markdown do RemNote guarda o realce personalizado.

# Format Painter BR 2.0.3 — realce personalizado (elementId)

- Diagnóstico do usuário: o realce personalizado vem como `h:"#rrggbb"` junto com um atributo de leitura `elementId`. O RemNote recusa `elementId` na gravação ("Invalid input"), o que impedia gravar qualquer texto contendo esses elementos.
- Na substituição segura (apaga só a seleção, insere formatado, confere o texto, desfaz se falhar), o trecho inserido agora **não leva o `elementId`**. O restante do Rem não é tocado.
- As formas alternativas do realce (hex normalizado, número RGB, predefinida mais próxima) continuam como último recurso.

# Format Painter BR 2.0.2 — realce personalizado recusado pelo RemNote

- Quando o RemNote recusa o realce no formato em que ele foi lido, o plugin tenta formas alternativas **dentro da substituição segura** (apaga só a seleção, insere formatado, confere o texto, desfaz se algo falhar): hexadecimal normalizado, número RGB e, por último, a cor predefinida mais próxima (com aviso de aproximação).
- Erros e o botão **?** agora mostram o valor das cores copiadas (`h`, `tc`), para identificar o formato exato.
- Nenhuma tentativa insere texto duplicado.

# Format Painter BR 2.0.1 — realce personalizado

- **Fim da duplicação de texto:** removida a inserção que colocava uma cópia do texto de destino com a cor. Agora, quando o RemNote recusa o realce personalizado no `setText`, o plugin **apaga só a seleção ativa e insere o mesmo texto já formatado**, confere se o texto do editor ficou idêntico ao original e, se não ficou, **desfaz**.
- O realce só é descartado (com aviso) se essa substituição também falhar.
- A mensagem de **Copiar** lista atributos do texto que o plugin não reconhece, e o botão **?** mostra os atributos da seleção (nome e tipo). Isso ajuda a identificar como o RemNote guarda o realce personalizado.

# Format Painter BR 2.0.0 — versão final

- Barra mais compacta: botões, ícones e moldura menores, com altura e largura proporcionais.
- **Duplo clique no botão de mover (⠿) recolhe a barra**; duplo clique de novo (ou no botão Expandir) reabre. A seta de recolher foi removida.
- Todo o restante da 1.9.2 permanece: seleção memorizada, gravação com alternativas e botão **?** de diagnóstico.

# Format Painter BR 1.9.2 — o RemNote recusava o RichText ("Invalid input")

Erro relatado: `editor.setText richText parameter: Invalid input`. Agora o plugin descobre o que o RemNote aceita, em vez de desistir:

- Se o RichText completo for recusado, tenta **sem o realce (h)**, **sem a cor (tc)** e **sem ambos**, aplicando o restante (negrito, itálico, sublinhado). O aviso informa o que foi descartado.
- Se o editor continuar recusando, tenta substituir **somente a seleção ativa** (só se ela ainda for exatamente a mesma) e, por último, grava pelo Rem.
- Se tudo falhar, o aviso mostra o **tipo de cada estilo copiado** (ex.: `tc=string,h=number`) e cada tentativa, sem nunca inserir texto duplicado.

# Format Painter BR 1.9.1 — diagnóstico no clique

- Novo botão **?** na barra: mostra, em um aviso, o que o plugin enxerga no instante do clique (seleção ao vivo, memória, editor focado, Rem, formato copiado). Não altera nada e não mostra o texto.
- O comando **fpx** agora faz o mesmo relatório.
- A barra ficou um pouco mais larga para caber o botão.

# Format Painter BR 1.9.0 — Copiar/Aplicar confiáveis pelos botões

Baseada na 1.8.4. Corrige o caso em que, ao clicar nos botões, às vezes nada era copiado ou aplicado.

- **Memória da última seleção:** o plugin principal registra a seleção válida (evento + verificação a cada 0,6 s). Se o clique na barra tirar o foco do editor, os botões usam essa seleção (válida por 20 s depois que ela some). A posição continua sendo conferida contra o texto real antes de gravar.
- **Gravação sem depender do foco:** se o editor não estiver focado ou recusar `setText`, a aplicação grava pelo Rem da própria seleção, só no campo (frente ou verso) em que o trecho confere exatamente. Se frente e verso conferirem igualmente, recusa.
- **Botão que não trava:** leitura e gravação têm limite de tempo; o botão volta ao normal e mostra o motivo.
- Toda a segurança da 1.8.x continua: nunca procura a palavra no restante do Rem, recusa seleção com clozes, links ou elementos especiais, e cancela se a posição não conferir.

## Histórico 1.8.4 — cópia exata da seleção

Esta atualização foi baseada na versão 1.8.3 e corrige a etapa **Copiar**.

- Captura o trecho selecionado antes de a barra flutuante provocar perda de foco.
- A cópia examina **somente** `selected.richText`, nunca procura ocorrências no restante do Rem.
- Se um único destaque incluir estilos diferentes, avisa e não escolhe automaticamente o estilo predominante.
- Preserva cores personalizadas em `tc`/`h` como fornecidas pelo editor.
- Mantém a interface, a barra móvel e recolhível.
- A gravação da versão 1.8.3 não foi modificada; ainda depende da aceitação do RichText pelo RemNote.

## Teste em Windows

Em uma pasta que contenha `package.json`:

```powershell
npm install
npm test
npm run dev
```

No RemNote: `Plugins → Build → Develop from localhost`. Desative a versão anterior, faça o primeiro teste em um Rem descartável, copie estilo de uma única palavra e confirme a notificação `Pincel 1.8.4`. Teste depois a aplicação na segunda ocorrência de `lei lei lei`.

**Limite:** testes de lógica não provam que o aplicativo desktop disponibiliza a seleção na mesma velocidade que o navegador. Quando a seleção não puder ser recuperada com segurança, o plugin cancela a operação.
