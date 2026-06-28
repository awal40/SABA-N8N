import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from flask import Flask

from routes.auth import auth_bp
from services import supabase_service


class _FakePostgrest:
    def __init__(self):
        self.close_calls = 0

    def aclose(self):
        self.close_calls += 1


class _FakeClient:
    def __init__(self):
        self._postgrest = _FakePostgrest()


class SupabaseReconnectTests(unittest.TestCase):
    def setUp(self):
        supabase_service._client = None

    def tearDown(self):
        supabase_service._reset_client()

    @patch('services.supabase_service.time.sleep', return_value=None)
    def test_transport_error_recreates_client_and_retries_safe_operation(self, _sleep):
        first_client = _FakeClient()
        second_client = _FakeClient()
        calls = []

        def operation(client):
            calls.append(client)
            if client is first_client:
                raise httpx.RemoteProtocolError('HTTP/2 connection terminated')
            return 'ok'

        with patch(
            'services.supabase_service.create_client',
            side_effect=[first_client, second_client],
        ) as create:
            result = supabase_service._execute_with_reconnect(
                operation,
                operation_name='pengujian operasi aman',
            )

        self.assertEqual(result, 'ok')
        self.assertEqual(calls, [first_client, second_client])
        self.assertEqual(create.call_count, 2)
        self.assertEqual(first_client._postgrest.close_calls, 1)

    @patch('services.supabase_service.time.sleep', return_value=None)
    def test_insert_style_operation_is_not_retried(self, _sleep):
        client = _FakeClient()
        call_count = 0

        def operation(_client):
            nonlocal call_count
            call_count += 1
            raise httpx.RemoteProtocolError('HTTP/2 connection terminated')

        with patch('services.supabase_service.create_client', return_value=client):
            with self.assertRaises(supabase_service.SupabaseTemporaryError):
                supabase_service._execute_with_reconnect(
                    operation,
                    retry=False,
                    operation_name='pengujian insert',
                )

        self.assertEqual(call_count, 1)
        self.assertEqual(client._postgrest.close_calls, 1)

    @patch('services.supabase_service.time.sleep', return_value=None)
    def test_second_transport_error_returns_friendly_exception(self, _sleep):
        clients = [_FakeClient(), _FakeClient()]

        def operation(_client):
            raise httpx.RemoteProtocolError('internal protocol detail')

        with patch(
            'services.supabase_service.create_client',
            side_effect=clients,
        ):
            with self.assertRaisesRegex(
                supabase_service.SupabaseTemporaryError,
                'Layanan database sementara tidak dapat dihubungi',
            ):
                supabase_service._execute_with_reconnect(
                    operation,
                    operation_name='pengujian gagal dua kali',
                )

        self.assertEqual([client._postgrest.close_calls for client in clients], [1, 1])


class AuthFriendlyErrorTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.secret_key = 'test-secret'
        self.app.register_blueprint(auth_bp)
        self.client = self.app.test_client()

    @patch('routes.auth.supabase_service.get_user_by_google_id')
    @patch('routes.auth.requests.get')
    @patch('routes.auth._create_oauth_flow')
    def test_callback_hides_internal_transport_error(
        self,
        create_flow,
        get_userinfo,
        get_user,
    ):
        flow = create_flow.return_value
        flow.credentials = SimpleNamespace(token='access-token', refresh_token='refresh-token')
        userinfo = get_userinfo.return_value
        userinfo.json.return_value = {
            'id': 'google-id',
            'email': 'user@example.com',
            'name': 'User',
        }
        get_user.side_effect = supabase_service.SupabaseTemporaryError(
            'internal transport detail'
        )

        response = self.client.get('/auth/callback?code=test-code')

        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.headers['Location'].endswith('/login'))
        with self.client.session_transaction() as flask_session:
            messages = [message for _category, message in flask_session.get('_flashes', [])]
        self.assertEqual(len(messages), 1)
        self.assertIn('Koneksi database sementara terganggu', messages[0])
        self.assertNotIn('internal transport detail', messages[0])


if __name__ == '__main__':
    unittest.main()
