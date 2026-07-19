// Bridge between your .env ANALYSE_URL and view.html.
// The browser cannot read .env directly, so set the value here.
// Edit these lines to point view.html tabs at any pipeline file.
window.ANALYSE_FILES = {
  "All Artists (input)": "input_data/artists.json",
  "Existing DB (input)": "input_data/existing_data.json",
  "No Duplicates": "output_json/no_duplicate_artists.json",
  "Renamed Cats": "output_json/2_renamed_data.json",
  "Null Free": "output_json/3_null_free.json",
  "Final (ImageKit)": "output_json/4_imaged_migration_final.json",
  "Extra (gaps source)": "output_json/extra.json",
};
// Default tab (must match a key above)
window.ANALYSE_DEFAULT = "Final (ImageKit)";
