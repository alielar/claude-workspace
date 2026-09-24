#!/bin/sh
# Makes a private certificate authority (once) and a server certificate for
# localhost + this Mac's .local name. The CA file (certs/ca.pem) is what the
# iPhone and the laptop browser must trust once. Re-run to renew (825 days).
set -e
cd "$(dirname "$0")"
HOST="$(scutil --get LocalHostName).local"
if [ ! -f ca.key ]; then
  openssl genrsa -out ca.key 3072 2>/dev/null
  openssl req -x509 -new -key ca.key -sha256 -days 3650 -subj "/CN=Wati Inbox local CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" -out ca.pem
fi
openssl genrsa -out server.key 2048 2>/dev/null
openssl req -new -key server.key -subj "/CN=$HOST" -out server.csr
cat > server.ext <<X
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,DNS:$HOST,IP:127.0.0.1
X
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 825 -sha256 -extfile server.ext -out server.pem
rm -f server.csr server.ext
echo "Certificate ready for https://localhost and https://$HOST — trust certs/ca.pem on each device."
