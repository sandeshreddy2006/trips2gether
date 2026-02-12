export default function Search({ placeholder }: { placeholder?: string }) {
    return (
        <div className="relative w-[420px]">
            <input placeholder={placeholder} className="w-full rounded-full border border-gray-200 px-4 py-2" />
            <button className="absolute right-1 top-1/2 -translate-y-1/2 bg-emerald-600 text-white px-4 py-1.5 rounded-full">Search</button>
        </div>
    );
}
