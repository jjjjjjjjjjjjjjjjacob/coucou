import { notFound } from "next/navigation";
import { BauhausLinePrototype } from "@/components/bauhaus-line-prototype";

export default function BauhausLinePrototypePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <BauhausLinePrototype />;
}
