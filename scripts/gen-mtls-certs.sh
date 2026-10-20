#!/usr/bin/env bash
# Local mTLS certificate set for the intake channel. Lab only.
# Builds a throwaway CA, a server certificate for localhost and a
# client certificate with the clientAuth purpose. Output lands under
# certs/mtls/, which is outside version control. Running it again
# does nothing while the three certificates are already there.
set -euo pipefail

out="certs/mtls"
ca="$out/ca.pem"
server="$out/server.pem"
client="$out/client.pem"

if [ -f "$ca" ] && [ -f "$server" ] && [ -f "$client" ]; then
  echo "mtls certificates already in $out, nothing to do"
  exit 0
fi

mkdir -p "$out"
chmod 700 "$out"

# Local certificate authority, 4096 bit RSA.
openssl genrsa -out "$out/ca.key" 4096
openssl req -x509 -new -sha256 -key "$out/ca.key" -days 3650 \
  -subj "/CN=cyberserious lab mtls ca" -out "$ca"

# Server certificate: CN localhost, SAN localhost and 127.0.0.1.
openssl genrsa -out "$out/server.key" 4096
openssl req -new -sha256 -key "$out/server.key" -subj "/CN=localhost" -out "$out/server.csr"
cat > "$out/server.ext" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1
EOF
openssl x509 -req -sha256 -days 825 -in "$out/server.csr" \
  -CA "$ca" -CAkey "$out/ca.key" -CAcreateserial \
  -extfile "$out/server.ext" -out "$server"

# Client certificate: clientAuth only, presented by the org sender.
openssl genrsa -out "$out/client.key" 4096
openssl req -new -sha256 -key "$out/client.key" -subj "/CN=org-sender" -out "$out/client.csr"
cat > "$out/client.ext" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
subjectAltName=DNS:org-sender
EOF
openssl x509 -req -sha256 -days 825 -in "$out/client.csr" \
  -CA "$ca" -CAkey "$out/ca.key" -CAcreateserial \
  -extfile "$out/client.ext" -out "$client"

rm -f "$out"/*.csr "$out"/*.ext "$out"/*.srl
chmod 600 "$out"/*.key
echo "wrote $ca, $server and $client under $out"
