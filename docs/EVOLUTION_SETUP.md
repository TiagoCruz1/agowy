# Setup Evolution do Zero (VPS + Docker)

Este guia cria uma instância Evolution API do zero e conecta com seu webhook Supabase.

## 1) Pré-requisitos

- VPS Linux (Ubuntu 22.04+ recomendado)
- Domínio/subdomínio apontando para a VPS (ex.: evolution.seudominio.com)
- Portas liberadas no firewall: 80, 443 e 8080 (temporariamente para teste)
- Docker e Docker Compose instalados

## 2) Instalar Docker (se ainda não tiver)

Execute na VPS:

sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER

Depois faça logout/login na VPS.

## 3) Subir Evolution com Docker Compose

Crie uma pasta e um compose:

mkdir -p ~/evolution
cd ~/evolution

Crie o arquivo docker-compose.yml com conteúdo:

services:
  evolution:
    image: atendai/evolution-api:latest
    container_name: evolution-api
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - SERVER_TYPE=http
      - SERVER_PORT=8080
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=COLOQUE_UMA_CHAVE_FORTE_AQUI
      - LOG_LEVEL=ERROR

Suba o container:

docker compose up -d

docker compose logs -f

## 4) Criar instância no Evolution

- Acesse: http://IP_DA_VPS:8080
- Crie uma instância WhatsApp
- Escaneie o QR Code

Guarde estes 3 dados:

- EVOLUTION_API_URL: URL base da API (ex.: https://evolution.seudominio.com)
- EVOLUTION_API_KEY: a chave configurada em AUTHENTICATION_API_KEY
- EVOLUTION_INSTANCE: nome da instância criada no painel

## 5) Configurar webhook para o Supabase

No painel Evolution, configure o webhook de mensagens para:

https://SEU_PROJECT_ID.supabase.co/functions/v1/whatsapp-webhook

Eventos para enviar:

- messages.upsert (ou equivalente de mensagem recebida)

## 6) Configurar secrets no Supabase

Na máquina com Supabase CLI logado no projeto:

supabase secrets set EVOLUTION_API_URL="https://evolution.seudominio.com"
supabase secrets set EVOLUTION_API_KEY="SUA_CHAVE_FORTE"
supabase secrets set EVOLUTION_INSTANCE="nome-da-instancia"

Deploy das funções:

supabase functions deploy whatsapp-webhook
supabase functions deploy send-whatsapp

## 7) Teste ponta a ponta

- Envie mensagem para o WhatsApp conectado na instância
- Verifique logs da função whatsapp-webhook no Supabase
- Verifique resposta automática no WhatsApp

## 8) Segurança e produção

- Coloque reverse proxy com HTTPS (Nginx + Certbot)
- Restrinja acesso ao painel Evolution
- Não use chave fraca
- Mantenha backup e monitoramento

## Troubleshooting rápido

- Mensagem chega no Evolution mas não responde:
  - Confirme webhook apontando para /functions/v1/whatsapp-webhook
  - Confirme secret EVOLUTION_INSTANCE igual ao nome da instância
  - Confirme EVOLUTION_API_KEY correta

- Erro 401 no envio:
  - Chave API incorreta

- Erro 404 no envio:
  - Nome da instância incorreto
