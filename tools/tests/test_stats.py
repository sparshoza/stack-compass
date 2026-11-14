from pathlib import Path

from compassdata.stats import catalog_stats, main, render_stats

FIXTURES = Path(__file__).parent / "fixtures"


def test_catalog_stats_counts_tools_per_layer_in_scoring_order():
    stats = catalog_stats(FIXTURES)
    assert stats["total"] == 4
    assert stats["layers"] == {"backend": 1, "frontend": 2, "database": 1}
    assert list(stats["layers"]) == ["backend", "frontend", "database"]
    assert stats["keywords"] >= 1


def test_render_stats_lists_layers_and_total():
    text = render_stats({"layers": {"backend": 1, "frontend": 2}, "total": 3, "keywords": 5})
    assert "backend" in text and "frontend" in text
    assert "total" in text and "3" in text
    assert "keyword entries" in text


def test_main_prints_stats(capsys):
    assert main(["--data", str(FIXTURES)]) == 0
    out = capsys.readouterr().out
    assert "total" in out
