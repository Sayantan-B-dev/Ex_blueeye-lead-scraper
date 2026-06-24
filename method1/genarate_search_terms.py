cities = [
    "Mumbai", "Delhi", "Gurugram", "Noida", "Bengaluru",
    "Hyderabad", "Pune", "Kolkata", "Ahmedabad", "Goa",
    "Lonavala", "Lucknow", "Indore", "Bhopal", "Bhubaneswar",
    "Patna", "Nagpur", "Surat", "Vapi", "Vadodara",
    "Raipur", "Bilaspur", "Udaipur", "Jaipur", "Jodhpur",
    "Bikaner", "Siliguri"
]

priority_1_categories = sorted(set([
    "Event Management Company",
    "Event Planner",
    "Event Organizer",
    "Event Agency",
    "Corporate Event Planner",
    "Corporate Event Management Company",
    "Wedding Planner",
    "Wedding Management Company",
    "Wedding Organizer",
    "Destination Wedding Planner",
    "Wedding Decorator",
    "Wedding Designer",
    "Event Production Company",
    "Artist Management Company",
    "Entertainment Agency",
    "Talent Agency"
]))

priority_2_categories = sorted(set([
    "Banquet Hall",
    "Marriage Hall",
    "Wedding Venue",
    "Convention Center",
    "Resort",
    "Luxury Resort",
    "Hotel",
    "Five Star Hotel",
    "Boutique Hotel",
    "Farmhouse",
    "Lawn",
    "Party Hall"
]))

priority_3_categories = sorted(set([
    "Night Club",
    "Club",
    "Social Club",
    "Sports Club",
    "Recreation Club",
    "Lounge",
    "Pub",
    "Bar",
    "Discotheque",
    "Music Venue",
    "Live Music Venue",
    "IT Company",
    "Software Company",
    "Startup",
    "Business Park",
    "Co-working Space",
    "Corporate Office",
    "Manufacturing Company",
    "Pharmaceutical Company",
    "Automobile Company",
    "Durga Puja Committee",
    "Kali Puja Committee",
    "Ganesh Mandal",
    "Cultural Association",
    "Bengali Association",
    "Gujarati Samaj",
    "Marathi Mandal",
    "Club House",
    "Resident Welfare Association (RWA)",
    "Housing Society",
    "University",
    "College",
    "School",
    "International School",
    "Management Institute",
    "Wedding Photographer",
    "Wedding Videographer",
    "Decorator",
    "Caterer",
    "Mehendi Artist",
    "Makeup Artist",
    "Bridal Studio",
    "Wedding Choreographer",
    "Exhibition Organizer",
    "Trade Fair Organizer",
    "Exhibition Center",
    "Expo Company"
]))


priority_groups = [
    ("priority_1_queries.txt", priority_1_categories),
    ("priority_2_queries.txt", priority_2_categories),
    ("priority_3_queries.txt", priority_3_categories),
]

for filename, categories in priority_groups:
    queries = []
    for city in cities:
        for category in categories:
            queries.append(f"{city} {category}")
    path = f"P-1/{filename}"
    with open(path, "w", encoding="utf-8") as f:
        for query in queries:
            f.write(query + "\n")
    print(f"Saved {len(queries)} queries to {path}")