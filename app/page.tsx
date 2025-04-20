"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

// Define the type for a tree species entry (should match the backend)
type TreeSpecies = {
  Species: string;
  Family: string;
  EcosystemService: string[];
  PartsUsed: string[];
  RelatedFunctionalTraits: string[];
  images?: string[];
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<TreeSpecies[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalImage, setModalImage] = useState<{
    images: string[];
    index: number;
  } | null>(null);
  const [visibleCount, setVisibleCount] = useState(20); // initial batch size
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      setResults(data.results);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError("Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Infinite scroll effect
  useEffect(() => {
    if (!results) return;
    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 20, results.length));
        }
      },
      { rootMargin: "200px" }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => {
      if (loaderRef.current) observer.unobserve(loaderRef.current);
    };
  }, [results]);

  // Show/hide back to top button on scroll
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-4 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <Image
          src="/globe.svg"
          alt="AmazonFACE logo"
          width={80}
          height={80}
          priority
        />
        <h1 className="text-2xl font-bold text-center mb-2">
          AmazonFACE Tree Species Explorer
        </h1>
        <p className="text-center max-w-xl mb-4">
          Explore the human uses of tree species found at the{" "}
          <a
            href="https://amazonface.unicamp.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-blue-700"
          >
            AmazonFACE
          </a>{" "}
          experimental plots. Ask questions about ecosystem services, parts
          used, and more.
        </p>
        {/* Example questions */}
        <div className="mb-4 w-full max-w-xl">
          <div className="font-semibold mb-1">Try these example questions:</div>
          <div className="flex flex-wrap gap-2">
            {[
              "Which trees are used for medicine?",
              "Show me trees that only the leaves are used.",
              "Which species provide food?",
            ].map((q, i) => (
              <button
                key={i}
                type="button"
                className="px-3 py-1 rounded bg-gray-200 dark:bg-neutral-800 text-sm hover:bg-green-100 dark:hover:bg-green-900 border border-gray-300 dark:border-neutral-700 transition-colors"
                onClick={() => setQuestion(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 w-full max-w-xl"
        >
          <label htmlFor="question" className="font-semibold">
            Ask about AmazonFACE tree species:
          </label>
          <input
            id="question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="border rounded px-3 py-2 text-black dark:text-white dark:bg-neutral-900 dark:border-neutral-700"
            placeholder="e.g. Which trees are used for medicine?"
            required
          />
          <button
            type="submit"
            className="bg-green-700 text-white rounded px-4 py-2 font-semibold disabled:opacity-50 dark:bg-green-800 dark:text-white"
            disabled={loading}
          >
            {loading ? "Searching..." : "Ask"}
          </button>
        </form>
        {error && <div className="text-red-600 font-semibold">{error}</div>}
        {results && (
          <div className="w-full max-w-xl mt-4">
            <h2 className="font-bold mb-2">Results: {results.length}</h2>
            {results.length === 0 ? (
              <div>No results found.</div>
            ) : (
              <>
                <ul className="list-disc pl-5">
                  {results.slice(0, visibleCount).map((item, idx) => (
                    <li key={idx} className="mb-6">
                      <span className="font-semibold">Species:</span>{" "}
                      {item.Species} <br />
                      <span className="font-semibold">
                        Ecosystem Service:
                      </span>{" "}
                      {item.EcosystemService.join(", ")} <br />
                      <span className="font-semibold">Parts Used:</span>{" "}
                      {item.PartsUsed.join(", ")} <br />
                      <span className="font-semibold">
                        Related Functiona Traits:
                      </span>{" "}
                      {item.RelatedFunctionalTraits.join(", ")}
                      {/* GBIF link */}
                      <div className="mt-1">
                        <a
                          href={`https://www.gbif.org/species/search?q=${encodeURIComponent(
                            item.Species
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          View on GBIF
                        </a>
                      </div>
                      {Array.isArray(item.images) && item.images.length > 0 && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <Image
                            src={item.images[0]}
                            alt={`Image of ${item.Species}`}
                            width={96}
                            height={96}
                            className="w-24 h-24 object-cover rounded border cursor-pointer hover:scale-105 transition-transform"
                            loading="lazy"
                            onClick={() =>
                              setModalImage({
                                images: (item.images ?? []).slice(0, 7),
                                index: 0,
                              })
                            }
                            unoptimized
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {/* Infinite scroll loader */}
                {visibleCount < results.length && (
                  <div
                    ref={loaderRef}
                    className="flex justify-center py-4 text-gray-500"
                  >
                    Loading more...
                  </div>
                )}
              </>
            )}
            {/* Modal for large image */}
            {modalImage && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70"
                onClick={() => {
                  setModalImage(null);
                }}
              >
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <div className="overflow-auto max-w-[90vw] max-h-[80vh] flex flex-col items-center justify-center bg-black rounded">
                    <TransformWrapper
                      initialScale={1}
                      minScale={0.5}
                      maxScale={4}
                      doubleClick={{ disabled: true }}
                    >
                      {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                          <TransformComponent>
                            <Image
                              src={modalImage.images[modalImage.index]}
                              alt="Large species"
                              width={800}
                              height={600}
                              className="object-contain select-none"
                              unoptimized
                              draggable={false}
                            />
                          </TransformComponent>
                          {/* Gallery Thumbnails */}
                          <div className="flex gap-2 mt-4 justify-center">
                            {modalImage.images.map((img, i) => (
                              <Image
                                key={i}
                                src={img}
                                alt={`Gallery image ${i + 1}`}
                                width={64}
                                height={64}
                                className={`object-cover rounded border cursor-pointer ${
                                  i === modalImage.index
                                    ? "ring-2 ring-green-600"
                                    : ""
                                }`}
                                onClick={() =>
                                  setModalImage({ ...modalImage, index: i })
                                }
                                unoptimized
                              />
                            ))}
                          </div>
                          {/* Zoom Controls */}
                          <div className="absolute bottom-[101%] left-1/2 -translate-x-1/2 flex gap-4 bg-white bg-opacity-80 rounded px-4 py-2 z-10">
                            <button
                              className="text-black font-bold text-lg px-2 py-1 rounded hover:bg-gray-200"
                              onClick={() => zoomOut()}
                            >
                              -
                            </button>
                            <button
                              className="text-black font-bold text-lg px-2 py-1 rounded hover:bg-gray-200"
                              onClick={() => zoomIn()}
                            >
                              +
                            </button>
                            <button
                              className="text-black font-bold text-lg px-2 py-1 rounded hover:bg-gray-200"
                              onClick={() => resetTransform()}
                            >
                              Reset
                            </button>
                          </div>
                        </>
                      )}
                    </TransformWrapper>
                  </div>
                  <button
                    className="absolute top-2 right-2 bg-white bg-opacity-80 rounded-full px-3 py-1 text-black font-bold text-lg hover:bg-opacity-100"
                    onClick={() => {
                      setModalImage(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://amazonface.org/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/globe.svg"
            alt="AmazonFACE logo"
            width={16}
            height={16}
          />
          AmazonFACE Project
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://github.com/amazonface"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/window.svg"
            alt="GitHub icon"
            width={16}
            height={16}
          />
          AmazonFACE on GitHub
        </a>
      </footer>
      {showBackToTop && (
        <button
          onClick={handleBackToTop}
          className="fixed bottom-8 right-8 z-50 bg-green-700 text-white px-4 py-2 rounded-full shadow-lg hover:bg-green-800 transition-colors"
          aria-label="Back to top"
        >
          ↑ Back to Top
        </button>
      )}
    </div>
  );
}
