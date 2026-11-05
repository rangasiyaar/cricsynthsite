"""Cleaning published docs made by older code."""

def test_tidy_drops_counts_and_new_prefix():
    from cricsim.insights import tidy
    doc = {"insights": [{"text": "A win 52% of 20,000 simulations."}],
           "summary": {"teams": [{"players": [{"id": "new:X Y", "name": "new:X Y"}, {"id": "p1", "name": "Z"}]}]}}
    tidy(doc)
    assert doc["insights"][0]["text"] == "A win 52% of our simulations."
    assert [p["name"] for p in doc["summary"]["teams"][0]["players"]] == ["X Y", "Z"]
    assert doc["summary"]["teams"][0]["players"][0]["id"] == "new:X Y"       # ids untouched
