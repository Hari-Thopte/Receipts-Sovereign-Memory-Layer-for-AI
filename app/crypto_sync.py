"""
app/crypto_sync.py
==================
Cryptographic module for sovereign cross-device sync.

Features:
- Symmetric encryption using AES-256-GCM with PBKDF2-HMAC-SHA256 key derivation.
- 100,000 PBKDF2 iterations with a cryptographically secure 16-byte salt.
- Authenticated Data (AEAD) binding ensures the encrypted bundle cannot be
  transferred between untrusted applications.
- SHA-256 payload checksum verifies payload integrity before decryption.
- Zero reliance on cloud sync servers: exported encrypted bundles can be transferred
  via file, copy-paste, QR payload, or secure local network.
"""

import os
import json
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, Tuple
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

AEAD_ASSOCIATED_DATA = b"RECEIPTS_SOVEREIGN_SYNC_V1"
KDF_ITERATIONS = 100_000


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    """Derives a 256-bit (32-byte) AES key from a passphrase and salt using PBKDF2-HMAC-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=KDF_ITERATIONS,
    )
    return kdf.derive(passphrase.encode("utf-8"))


def encrypt_vault_payload(data: Dict[str, Any], passphrase: str) -> Dict[str, Any]:
    """
    Encrypts a vault data dictionary (memories, audit logs, user_id) using AES-256-GCM.
    Returns an armored JSON-safe dictionary containing salt, nonce, ciphertext, and checksum.
    """
    if not passphrase or len(passphrase.strip()) < 4:
        raise ValueError("Passphrase must be at least 4 characters long.")

    plaintext_bytes = json.dumps(data, ensure_ascii=False, sort_keys=True).encode("utf-8")
    checksum = hashlib.sha256(plaintext_bytes).hexdigest()

    salt = os.urandom(16)
    nonce = os.urandom(12)  # 96-bit nonce standard for AES-GCM
    key = _derive_key(passphrase, salt)

    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext_bytes, AEAD_ASSOCIATED_DATA)

    return {
        "version": "1.0",
        "cipher": "AES-256-GCM",
        "kdf": "PBKDF2-HMAC-SHA256",
        "kdf_iterations": KDF_ITERATIONS,
        "salt_hex": salt.hex(),
        "nonce_hex": nonce.hex(),
        "ciphertext_hex": ciphertext.hex(),
        "checksum_sha256": checksum,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "fact_count": len(data.get("memories", [])),
        "user_id": data.get("user_id", "default")
    }


def decrypt_vault_payload(armored: Dict[str, Any], passphrase: str) -> Dict[str, Any]:
    """
    Decrypts an armored vault bundle using AES-256-GCM and verifies its SHA-256 checksum.
    Raises ValueError on invalid passphrase, corrupted ciphertext, or altered checksum.
    """
    if not passphrase:
        raise ValueError("Passphrase is required for decryption.")

    required_keys = {"salt_hex", "nonce_hex", "ciphertext_hex", "checksum_sha256"}
    if not required_keys.issubset(armored.keys()):
        raise ValueError("Invalid sync bundle format. Missing cryptographic envelope fields.")

    try:
        salt = bytes.fromhex(armored["salt_hex"])
        nonce = bytes.fromhex(armored["nonce_hex"])
        ciphertext = bytes.fromhex(armored["ciphertext_hex"])
    except ValueError as exc:
        raise ValueError(f"Hex decoding error in sync bundle: {exc}")

    key = _derive_key(passphrase, salt)
    aesgcm = AESGCM(key)

    try:
        plaintext_bytes = aesgcm.decrypt(nonce, ciphertext, AEAD_ASSOCIATED_DATA)
    except Exception:
        raise ValueError("Decryption failed. Incorrect passphrase or tampered sync payload.")

    computed_checksum = hashlib.sha256(plaintext_bytes).hexdigest()
    expected_checksum = armored.get("checksum_sha256")
    if expected_checksum and computed_checksum != expected_checksum:
        raise ValueError("Integrity verification failed: SHA-256 checksum does not match payload.")

    try:
        return json.loads(plaintext_bytes.decode("utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse decrypted JSON data: {exc}")
