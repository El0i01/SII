#!/usr/bin/env python3
"""Cria somente a stack sii no mesmo ambiente Docker da stack reurb."""

import argparse
import http.client
import json
import os
from pathlib import Path
import secrets
import ssl
import subprocess

HOST = '192.168.1.22'
SSH = [
    'ssh', '-i', str(Path.home() / '.ssh/reurb_prod'),
    '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', f'reurb@{HOST}',
]
CHAVES = (
    'POSTGRES_PASSWORD', 'REDIS_SENHA', 'MINIO_ROOT_PASSWORD', 'CHAVE_CIFRA',
    'CHAVE_HMAC', 'JWT_SEGREDO',
)


def ler_env(path):
    return dict(
        linha.split('=', 1) for linha in path.read_text().splitlines()
        if '=' in linha and not linha.startswith('#')
    )


def segredos(path):
    if not path.exists():
        modo = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        with os.fdopen(os.open(path, modo, 0o600), 'w') as arquivo:
            for chave in (*CHAVES, 'ADMIN_SENHA'):
                arquivo.write(f'{chave}={secrets.token_hex(32)}\n')
    if path.stat().st_mode & 0o077:
        raise SystemExit('O arquivo de segredos deve ter permissão 600.')
    return ler_env(path)


def certificado_portainer():
    # Obtém o certificado por SSH autenticado antes de enviar credenciais pela API.
    return ssl.PEM_cert_to_DER_cert(subprocess.check_output(
        [*SSH, 'openssl s_client -connect 127.0.0.1:9443 </dev/null 2>/dev/null | openssl x509'],
        text=True,
    ))


def requisitar(certificado, metodo, caminho, corpo=None, token=None):
    contexto = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    contexto.check_hostname = False
    contexto.verify_mode = ssl.CERT_NONE
    conexao = http.client.HTTPSConnection(HOST, 9443, context=contexto, timeout=180)
    try:
        conexao.connect()
        if conexao.sock.getpeercert(binary_form=True) != certificado:
            raise SystemExit('O certificado do Portainer diverge do certificado obtido por SSH.')
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        payload = None if corpo is None else json.dumps(corpo)
        conexao.request(metodo, f'/api{caminho}', payload, headers)
        resposta = conexao.getresponse()
        if not 200 <= resposta.status < 300:
            raise SystemExit(f'Portainer retornou HTTP {resposta.status} para {metodo} {caminho}.')
        return json.load(resposta)
    finally:
        conexao.close()


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('versao')
    cli.add_argument('--criar', action='store_true')
    args = cli.parse_args()
    cert = certificado_portainer()
    acesso = ler_env(Path.home() / 'reurb-prod-segredos.env')
    token = requisitar(cert, 'POST', '/auth', {
        'Username': acesso['PORTAINER_USUARIO'], 'Password': acesso['PORTAINER_SENHA'],
    })['jwt']
    stacks = requisitar(cert, 'GET', '/stacks', token=token)
    reurb = [s for s in stacks if s['Name'] == 'reurb' and s['Type'] == 2]
    if len(reurb) != 1:
        raise SystemExit('Não foi possível identificar um único ambiente Docker do Reurb.')
    endpoint = reurb[0]['EndpointId']
    existente = next((s for s in stacks if s['Name'] == 'sii' and s['EndpointId'] == endpoint), None)
    if existente:
        print(f"Stack sii existente, ID {existente['Id']}, ambiente {endpoint}.")
        if args.criar:
            raise SystemExit('Criação interrompida para preservar a stack existente.')
        return
    if not args.criar:
        print(f'Ambiente {endpoint} identificado. Nome sii disponível.')
        return
    valores = segredos(Path.home() / 'sii-prod-segredos.env')
    env = {chave: valores[chave] for chave in CHAVES}
    env.update(SII_HOST=HOST, SII_VERSAO=args.versao)
    stack = requisitar(cert, 'POST', f'/stacks/create/standalone/string?endpointId={endpoint}', {
        'name': 'sii',
        'stackFileContent': Path(__file__).with_name('portainer-stack.yml').read_text(),
        'env': [{'name': chave, 'value': valor} for chave, valor in env.items()],
    }, token)
    print(f"Stack sii criada, ID {stack['Id']}, ambiente {endpoint}.")


if __name__ == '__main__':
    main()
