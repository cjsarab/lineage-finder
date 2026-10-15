import { Link } from "react-router"

export function NotFoundPage() {
  return (
    <section className="space-y-4 border-2 border-border bg-card p-6 shadow-md">
      <h1 className="font-head text-2xl">Page not found</h1>
      <p>
        There's nothing at this address.{" "}
        <Link to="/" className="underline">
          Go to the home page
        </Link>
        .
      </p>
    </section>
  )
}
