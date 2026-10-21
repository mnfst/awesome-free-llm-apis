# StreamDesk

O StreamDesk é um aplicativo original para Windows compatível com serviços
Xtream Codes. Inclui login, catálogos de canais ao vivo, filmes e séries,
filtros por categoria, busca, seleção de episódios e reprodução pelo VLC.

Use somente serviços e transmissões aos quais você tem autorização de acesso.
O StreamDesk não inclui assinatura, servidor, credenciais ou conteúdo. Os dados
de login ficam somente na memória do aplicativo; o VLC recebe o endereço do
conteúdo selecionado para reproduzi-lo.

## Executar pelo código-fonte

- Instale o Python 3.10 ou mais recente para Windows.
- Na pasta `windows-iptv-player`, execute `python streamdesk\app.py`.
- Instale o VLC em <https://www.videolan.org/vlc/> para reproduzir transmissões
  HLS.
- Informe no aplicativo o endereço, o usuário e a senha fornecidos pelo seu
  serviço.

## Criar o executável para Windows

Instale o PyInstaller com `python -m pip install pyinstaller` e execute
`powershell -ExecutionPolicy Bypass -File .\build.ps1`. O arquivo independente
será gerado em `dist\StreamDesk.exe`.

## Testes

Na pasta do projeto, execute `python -m unittest discover -s tests`.
