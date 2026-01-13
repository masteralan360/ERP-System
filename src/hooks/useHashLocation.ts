import { useState, useEffect } from "react";

// Custom hook for hash-based routing in wouter
const currentLoc = () => {
    const hash = window.location.hash.replace(/^#/, "") || "/";
    // Return only the path part for route matching (strip query string)
    return hash.split('?')[0] || "/";
};

export const useHashLocation = () => {
    const [loc, setLoc] = useState(currentLoc());

    useEffect(() => {
        const handler = () => setLoc(currentLoc());

        window.addEventListener("hashchange", handler);
        return () => window.removeEventListener("hashchange", handler);
    }, []);

    const navigate = (to: string) => {
        // If navigating to a path, we just set the hash
        window.location.hash = to;
    };

    return [loc, navigate] as [string, (to: string) => void];
};
