import HotelSearchPanel from "../../components/HotelSearchPanel";

export default function HotelsPage() {
    return (
        <main style={{ padding: "2rem" }}>
            <HotelSearchPanel
                title="Explore Hotels"
                subtitle="Find suitable accommodation by destination, dates, guests, rooms, and sorting preference."
            />
        </main>
    );
}
