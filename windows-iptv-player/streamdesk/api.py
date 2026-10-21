from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class XtreamError(Exception):
    """A server or network error that can be shown to the user."""


class XtreamClient:
    def __init__(self, server: str, username: str, password: str, timeout: int = 20):
        parsed = urllib.parse.urlsplit(server.strip().rstrip("/"))
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Informe o endereço completo do servidor, começando com http:// ou https://.")
        if parsed.username or parsed.password:
            raise ValueError("Informe usuário e senha nos campos próprios, não no endereço do servidor.")
        if parsed.query or parsed.fragment:
            raise ValueError("Informe apenas o endereço do servidor, sem parâmetros ou fragmentos.")
        if not username.strip() or not password:
            raise ValueError("Preencha o usuário e a senha.")

        path = parsed.path.rstrip("/")
        if path.casefold().endswith("/player_api.php"):
            path = path[: -len("/player_api.php")].rstrip("/")
        self.base_url = urllib.parse.urlunsplit(
            (parsed.scheme, parsed.netloc, path, "", "")
        )
        self.username = username.strip()
        self.password = password
        self.timeout = timeout

    def _request(self, params: dict[str, str]) -> Any:
        query = urllib.parse.urlencode(
            {"username": self.username, "password": self.password, **params}
        )
        url = f"{self.base_url}/player_api.php?{query}"
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "StreamDesk/1.0", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = response.read()
        except urllib.error.HTTPError as exc:
            raise XtreamError(f"O servidor respondeu com HTTP {exc.code}.") from exc
        except urllib.error.URLError as exc:
            reason = getattr(exc, "reason", "falha de conexão")
            raise XtreamError(f"Não foi possível conectar ao servidor: {reason}") from exc
        except TimeoutError as exc:
            raise XtreamError("A conexão com o servidor expirou.") from exc

        try:
            data = json.loads(payload)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise XtreamError("O servidor retornou uma resposta inválida.") from exc
        if isinstance(data, dict) and data.get("error"):
            raise XtreamError(str(data["error"]))
        return data

    def authenticate(self) -> dict[str, Any]:
        data = self._request({})
        if not isinstance(data, dict) or not isinstance(data.get("user_info"), dict):
            raise XtreamError("Resposta de login incompatível com a API Xtream Codes.")
        user_info = data["user_info"]
        if str(user_info.get("auth", "0")) != "1":
            raise XtreamError("Usuário ou senha inválidos, ou conta desativada.")
        return user_info

    def categories(self, media_type: str) -> list[dict[str, Any]]:
        action = {
            "live": "get_live_categories",
            "movie": "get_vod_categories",
            "series": "get_series_categories",
        }[media_type]
        return self._list(self._request({"action": action}))

    def streams(self, media_type: str, category_id: str = "") -> list[dict[str, Any]]:
        action = {
            "live": "get_live_streams",
            "movie": "get_vod_streams",
            "series": "get_series",
        }[media_type]
        params = {"action": action}
        if category_id:
            params["category_id"] = category_id
        return self._list(self._request(params))

    def series_info(self, series_id: str) -> dict[str, Any]:
        data = self._request({"action": "get_series_info", "series_id": series_id})
        if not isinstance(data, dict):
            raise XtreamError("O servidor retornou detalhes inválidos para a série.")
        return data

    @staticmethod
    def _list(data: Any) -> list[dict[str, Any]]:
        if not isinstance(data, list):
            raise XtreamError("O servidor retornou uma lista de conteúdo inválida.")
        return [item for item in data if isinstance(item, dict)]

    def stream_url(self, media_type: str, stream_id: str, extension: str = "") -> str:
        if media_type not in {"live", "movie", "series"}:
            raise ValueError("Tipo de mídia desconhecido.")
        safe_id = urllib.parse.quote(str(stream_id), safe="")
        safe_user = urllib.parse.quote(self.username, safe="")
        safe_password = urllib.parse.quote(self.password, safe="")
        suffix = f".{urllib.parse.quote(extension.lstrip('.'), safe='')}" if extension else ""
        return (
            f"{self.base_url}/{media_type}/{safe_user}/{safe_password}/"
            f"{safe_id}{suffix}"
        )
