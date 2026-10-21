import json
import unittest
from unittest.mock import patch

from streamdesk.api import XtreamClient, XtreamError


class XtreamClientTests(unittest.TestCase):
    def client(self) -> XtreamClient:
        return XtreamClient("https://example.test:8443/portal/", "user name", "p@ss/word")

    def test_rejects_non_http_server(self) -> None:
        with self.assertRaises(ValueError):
            XtreamClient("example.test", "user", "password")

    def test_accepts_full_xtream_api_endpoint(self) -> None:
        client = XtreamClient(
            "https://example.test/portal/player_api.php", "user", "password"
        )
        self.assertEqual(client.base_url, "https://example.test/portal")

    def test_authentication_requires_active_account(self) -> None:
        with patch.object(
            XtreamClient,
            "_request",
            return_value={"user_info": {"auth": 1, "status": "Active"}},
        ):
            self.assertEqual(self.client().authenticate()["status"], "Active")
        with patch.object(
            XtreamClient, "_request", return_value={"user_info": {"auth": 0}}
        ):
            with self.assertRaises(XtreamError):
                self.client().authenticate()

    def test_stream_url_escapes_credentials_and_uses_media_type(self) -> None:
        url = self.client().stream_url("movie", "42", ".m3u8")
        self.assertEqual(
            url,
            "https://example.test:8443/portal/movie/user%20name/p%40ss%2Fword/42.m3u8",
        )

    def test_categories_use_xtream_action(self) -> None:
        client = self.client()
        with patch.object(client, "_request", return_value=[{"category_id": "8"}]) as request:
            self.assertEqual(client.categories("series"), [{"category_id": "8"}])
        request.assert_called_once_with({"action": "get_series_categories"})

    def test_rejects_non_json_api_response(self) -> None:
        client = self.client()

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b"not json"

        with patch("streamdesk.api.urllib.request.urlopen", return_value=Response()):
            with self.assertRaisesRegex(XtreamError, "resposta inválida"):
                client._request({})


if __name__ == "__main__":
    unittest.main()
