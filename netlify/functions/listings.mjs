// Live for-sale listings via the "Realty in US" API on RapidAPI (realtor.com data).
// Set RAPIDAPI_KEY in Netlify env vars. Results are cached at the CDN for 6 hours to save API calls.
export default async (req) => {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return Response.json({ error: "no_key" }, { status: 503 });
  const u = new URL(req.url);
  const REGIONS = {
    mont: [["Bethesda","MD"],["Rockville","MD"],["Silver Spring","MD"],["Gaithersburg","MD"],["Potomac","MD"]],
    how: [["Columbia","MD"],["Ellicott City","MD"],["Clarksville","MD"]],
    dc: [["Washington","DC"]],
    nova: [["Arlington","VA"],["Alexandria","VA"],["Fairfax","VA"],["Reston","VA"],["McLean","VA"]],
  };
  const region = u.searchParams.get("region");
  const places = REGIONS[region] || Object.entries(REGIONS).flatMap(([r, c]) => c);
  const results = await Promise.all(places.map(([city, state]) => search(key, city, state)));
  if (results.every(r => r === null)) return Response.json({ error: "upstream" }, { status: 502 });
  const listings = results.flat().filter(Boolean);
  return Response.json({ listings }, { headers: { "cache-control": "public, max-age=0", "netlify-cdn-cache-control": "public, s-maxage=21600" } });
};

async function search(key, city, state) {
  const res = await fetch("https://realty-in-us.p.rapidapi.com/properties/v3/list", {
    method: "POST",
    headers: { "content-type": "application/json", "x-rapidapi-key": key, "x-rapidapi-host": "realty-in-us.p.rapidapi.com" },
    body: JSON.stringify({ limit: 40, offset: 0, city, state_code: state, status: ["for_sale"], type: ["townhomes"], sort: { direction: "desc", field: "list_date" } }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const rows = data?.data?.home_search?.results || [];
  return rows.filter(r => r.primary_photo?.href && r.location?.address?.line).map(r => {
    const a = r.location.address, d = r.description || {};
    const adv = (r.advertisers || [])[0] || {};
    return {
      address: `${a.line}, ${a.city}, ${a.state_code} ${a.postal_code}`,
      price: r.list_price, beds: d.beds, baths: d.baths_consolidated ?? d.baths, sqft: d.sqft,
      agent: adv.name || "", brokerage: adv.office?.name || r.branding?.[0]?.name || "",
      photo: r.primary_photo.href.replace(/s\.jpg$/, "od-w1024_h768.jpg"),
      url: r.href || "",
    };
  });
}
