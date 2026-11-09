from __future__ import annotations

import json

from fastapi.testclient import TestClient

from backend import main


client = TestClient(main.app)


def test_health_reports_api_available():
    response = client.get('/api/health')

    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_facility_filters_are_applied_together():
    response = client.get('/api/facilities', params={'hub': 'Chennai', 'tier': 'Mixed-use'})

    assert response.status_code == 200
    facilities = response.json()
    assert facilities
    assert all(facility['hub'] == 'Chennai' for facility in facilities)
    assert all(facility['classification_tier'] == 'Mixed-use' for facility in facilities)


def test_risk_geojson_has_named_prototype_features():
    response = client.get('/api/districts/geojson')

    assert response.status_code == 200
    collection = response.json()
    assert collection['type'] == 'FeatureCollection'
    assert collection['features']
    assert all(feature['properties']['name'] for feature in collection['features'])
    assert all(feature['properties']['water_stress'] for feature in collection['features'])
    assert all(feature['properties']['climate_vulnerability'] for feature in collection['features'])


def test_geocode_returns_place_details(monkeypatch):
    result = [{
        'name': 'Pune',
        'display_name': 'Pune, Maharashtra, India',
        'lat': '18.5204',
        'lon': '73.8567',
        'address': {'state': 'Maharashtra'},
    }]

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return json.dumps(result).encode()

    monkeypatch.setattr(main, 'urlopen', lambda *_args, **_kwargs: FakeResponse())

    response = client.get('/api/geocode', params={'q': 'Pune'})

    assert response.status_code == 200
    assert response.json()['name'] == 'Pune'
    assert response.json()['state'] == 'Maharashtra'
    assert response.json()['lat'] == '18.5204'


def test_places_returns_multiple_selectable_results(monkeypatch):
    results = [
        {
            'name': 'Mumbai',
            'display_name': 'Mumbai, Maharashtra, India',
            'lat': '19.076',
            'lon': '72.8777',
            'address': {'state': 'Maharashtra'},
        },
        {
            'name': 'Mumbai Suburban',
            'display_name': 'Mumbai Suburban, Maharashtra, India',
            'lat': '19.15',
            'lon': '72.85',
            'address': {'state': 'Maharashtra'},
        },
    ]

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return json.dumps(results).encode()

    monkeypatch.setattr(main, 'urlopen', lambda *_args, **_kwargs: FakeResponse())

    response = client.get('/api/places', params={'q': 'Mumbai'})

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert response.json()[1]['name'] == 'Mumbai Suburban'


def test_geocode_reports_no_match(monkeypatch):
    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return b'[]'

    monkeypatch.setattr(main, 'urlopen', lambda *_args, **_kwargs: FakeResponse())

    response = client.get('/api/geocode', params={'q': 'No matching place'})

    assert response.status_code == 404
    assert response.json()['detail'] == 'No matching Indian place found.'


def test_geocode_reports_provider_outage(monkeypatch):
    def fail_lookup(*_args, **_kwargs):
        raise OSError('provider unavailable')

    monkeypatch.setattr(main, 'urlopen', fail_lookup)

    response = client.get('/api/geocode', params={'q': 'Pune'})

    assert response.status_code == 502
    assert response.json()['detail'] == 'Place lookup is temporarily unavailable.'