"use node";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

// Sample data for realistic test users
const FIRST_NAMES = [
  "Alex",
  "Jamie",
  "Casey",
  "Taylor",
  "Jordan",
  "Riley",
  "Morgan",
  "Avery",
  "Quinn",
  "Sage",
  "Blake",
  "Drew",
  "Emery",
  "Finley",
  "Hayden",
  "Parker",
  "Reese",
  "Rowan",
  "Skylar",
  "Cameron",
  "Devon",
  "Ellis",
  "Harley",
  "Kendall",
  "Lane",
  "London",
  "Marley",
  "Phoenix",
  "River",
  "Sam",
  "Seven",
  "Tatum",
  "Charlie",
  "Dakota",
  "Denver",
  "Justice",
  "Kai",
  "Lake",
  "Ocean",
  "Rain",
  "Sage",
  "Scout",
  "Story",
  "True",
  "Winter",
  "Aspen",
  "August",
  "Bay",
  "Blue",
  "Brooks",
  "Cedar",
  "Cruz",
  "Gray",
  "Hunter",
  "Indigo",
  "Jules",
];

const LAST_NAMES = [
  "Anderson",
  "Brown",
  "Chen",
  "Davis",
  "Evans",
  "Fisher",
  "Garcia",
  "Harris",
  "Jackson",
  "Kim",
  "Lee",
  "Martinez",
  "Nelson",
  "O'Connor",
  "Patel",
  "Quinn",
  "Rodriguez",
  "Smith",
  "Taylor",
  "Valdez",
  "Wilson",
  "Yang",
  "Zhang",
  "Adams",
  "Baker",
  "Clark",
  "Cooper",
  "Foster",
  "Green",
  "Hall",
  "Hill",
  "Jones",
  "Lewis",
  "Miller",
  "Moore",
  "Parker",
  "Roberts",
  "Turner",
  "Walker",
  "White",
  "Wright",
  "Young",
  "Allen",
  "Bell",
  "Carter",
  "Collins",
  "Cook",
  "Edwards",
  "Flores",
  "Gray",
  "Howard",
  "Hughes",
  "James",
  "Johnson",
  "King",
  "Lopez",
];

const DIETARY_RESTRICTIONS = [
  "Vegetarian",
  "Vegan",
  "Gluten-free",
  "Dairy-free",
  "Nut allergy",
  "Shellfish allergy",
  "Kosher",
  "Halal",
  "Keto",
  "Paleo",
];

const SPECIAL_REQUESTS = [
  "Wheelchair accessible seating",
  "Table near stage",
  "Quiet area preferred",
  "Close to restrooms",
  "Group seating for 6",
  "Photography allowed",
  "Plus one requested",
  "VIP meet & greet",
  "Early entry preferred",
];

const COMPANIES = [
  "TechCorp",
  "StartupX",
  "Innovation Labs",
  "Digital Solutions",
  "Creative Agency",
  "Data Analytics Co",
  "Cloud Systems",
  "Mobile First",
  "AI Ventures",
  "Blockchain Inc",
];

interface PublicInstagramSeedProfile {
  displayName: string;
  instagramHandle: string;
  category: string;
}

const DEFAULT_PUBLIC_INSTAGRAM_SEED_COUNT = 100;
const DEFAULT_PUBLIC_INSTAGRAM_SEED_SITE_KEY = "dojo";
const DEFAULT_PUBLIC_INSTAGRAM_SEED_WORKSPACE_SLUG = "dojo-pomodoro";

const PUBLIC_INSTAGRAM_SEED_PROFILES = [
  { displayName: "Cristiano Ronaldo", instagramHandle: "cristiano", category: "Sports" },
  { displayName: "Lionel Messi", instagramHandle: "leomessi", category: "Sports" },
  { displayName: "Selena Gomez", instagramHandle: "selenagomez", category: "Music" },
  { displayName: "Kylie Jenner", instagramHandle: "kyliejenner", category: "Beauty" },
  { displayName: "Dwayne Johnson", instagramHandle: "therock", category: "Entertainment" },
  { displayName: "Ariana Grande", instagramHandle: "arianagrande", category: "Music" },
  { displayName: "Kim Kardashian", instagramHandle: "kimkardashian", category: "Beauty" },
  { displayName: "Beyonce", instagramHandle: "beyonce", category: "Music" },
  { displayName: "Khloe Kardashian", instagramHandle: "khloekardashian", category: "Lifestyle" },
  { displayName: "Kendall Jenner", instagramHandle: "kendalljenner", category: "Fashion" },
  { displayName: "Justin Bieber", instagramHandle: "justinbieber", category: "Music" },
  { displayName: "Taylor Swift", instagramHandle: "taylorswift", category: "Music" },
  { displayName: "Jennifer Lopez", instagramHandle: "jlo", category: "Entertainment" },
  { displayName: "Virat Kohli", instagramHandle: "virat.kohli", category: "Sports" },
  { displayName: "Nicki Minaj", instagramHandle: "nickiminaj", category: "Music" },
  { displayName: "Miley Cyrus", instagramHandle: "mileycyrus", category: "Music" },
  { displayName: "Katy Perry", instagramHandle: "katyperry", category: "Music" },
  { displayName: "Kevin Hart", instagramHandle: "kevinhart4real", category: "Comedy" },
  { displayName: "Zendaya", instagramHandle: "zendaya", category: "Entertainment" },
  { displayName: "Rihanna", instagramHandle: "badgalriri", category: "Beauty" },
  { displayName: "Drake", instagramHandle: "champagnepapi", category: "Music" },
  { displayName: "LeBron James", instagramHandle: "kingjames", category: "Sports" },
  { displayName: "Billie Eilish", instagramHandle: "billieeilish", category: "Music" },
  { displayName: "Dua Lipa", instagramHandle: "dualipa", category: "Music" },
  { displayName: "Shakira", instagramHandle: "shakira", category: "Music" },
  { displayName: "Cardi B", instagramHandle: "iamcardib", category: "Music" },
  { displayName: "Demi Lovato", instagramHandle: "ddlovato", category: "Music" },
  { displayName: "Emma Watson", instagramHandle: "emmawatson", category: "Entertainment" },
  { displayName: "Gal Gadot", instagramHandle: "gal_gadot", category: "Entertainment" },
  {
    displayName: "Priyanka Chopra Jonas",
    instagramHandle: "priyankachopra",
    category: "Entertainment",
  },
  { displayName: "Gigi Hadid", instagramHandle: "gigihadid", category: "Fashion" },
  { displayName: "Bella Hadid", instagramHandle: "bellahadid", category: "Fashion" },
  { displayName: "Hailey Bieber", instagramHandle: "haileybieber", category: "Fashion" },
  { displayName: "Emily Ratajkowski", instagramHandle: "emrata", category: "Fashion" },
  { displayName: "Cara Delevingne", instagramHandle: "caradelevingne", category: "Fashion" },
  { displayName: "Naomi Campbell", instagramHandle: "naomi", category: "Fashion" },
  { displayName: "Ashley Graham", instagramHandle: "ashleygraham", category: "Fashion" },
  { displayName: "Karlie Kloss", instagramHandle: "karliekloss", category: "Fashion" },
  { displayName: "Winnie Harlow", instagramHandle: "winnieharlow", category: "Fashion" },
  { displayName: "Chiara Ferragni", instagramHandle: "chiaraferragni", category: "Fashion" },
  { displayName: "Aimee Song", instagramHandle: "songofstyle", category: "Fashion" },
  { displayName: "Danielle Bernstein", instagramHandle: "weworewhat", category: "Fashion" },
  { displayName: "Bryanboy", instagramHandle: "bryanboy", category: "Fashion" },
  { displayName: "Camila Coelho", instagramHandle: "camilacoelho", category: "Fashion" },
  { displayName: "Negin Mirsalehi", instagramHandle: "negin_mirsalehi", category: "Fashion" },
  { displayName: "Olivia Palermo", instagramHandle: "oliviapalermo", category: "Fashion" },
  { displayName: "Leonie Hanne", instagramHandle: "leoniehanne", category: "Fashion" },
  { displayName: "Chriselle Lim", instagramHandle: "chrisellelim", category: "Fashion" },
  { displayName: "Camila Coutinho", instagramHandle: "camilacoutinho", category: "Fashion" },
  { displayName: "Mariano Di Vaio", instagramHandle: "marianodivaio", category: "Fashion" },
  { displayName: "MrBeast", instagramHandle: "mrbeast", category: "Creator" },
  { displayName: "Khaby Lame", instagramHandle: "khaby00", category: "Creator" },
  { displayName: "Charli D'Amelio", instagramHandle: "charlidamelio", category: "Creator" },
  { displayName: "Dixie D'Amelio", instagramHandle: "dixiedamelio", category: "Creator" },
  { displayName: "Addison Rae", instagramHandle: "addisonraee", category: "Creator" },
  { displayName: "Zach King", instagramHandle: "zachking", category: "Creator" },
  { displayName: "Lele Pons", instagramHandle: "lelepons", category: "Comedy" },
  { displayName: "Amanda Cerny", instagramHandle: "amandacerny", category: "Comedy" },
  { displayName: "Liza Koshy", instagramHandle: "lizakoshy", category: "Comedy" },
  { displayName: "King Bach", instagramHandle: "kingbach", category: "Comedy" },
  { displayName: "Logan Paul", instagramHandle: "loganpaul", category: "Creator" },
  { displayName: "Jake Paul", instagramHandle: "jakepaul", category: "Creator" },
  { displayName: "Casey Neistat", instagramHandle: "caseyneistat", category: "Creator" },
  { displayName: "Marques Brownlee", instagramHandle: "mkbhd", category: "Tech" },
  { displayName: "Gary Vaynerchuk", instagramHandle: "garyvee", category: "Business" },
  { displayName: "Mark Zuckerberg", instagramHandle: "zuck", category: "Tech" },
  { displayName: "Neil Patel", instagramHandle: "neilpatel", category: "Business" },
  { displayName: "Tim Ferriss", instagramHandle: "timferriss", category: "Business" },
  { displayName: "Tony Robbins", instagramHandle: "tonyrobbins", category: "Business" },
  { displayName: "Richard Branson", instagramHandle: "richardbranson", category: "Business" },
  { displayName: "Gordon Ramsay", instagramHandle: "gordongram", category: "Food" },
  { displayName: "Jamie Oliver", instagramHandle: "jamieoliver", category: "Food" },
  { displayName: "Tieghan Gerard", instagramHandle: "halfbakedharvest", category: "Food" },
  { displayName: "Ree Drummond", instagramHandle: "thepioneerwoman", category: "Food" },
  { displayName: "Minimalist Baker", instagramHandle: "minimalistbaker", category: "Food" },
  { displayName: "Pinch of Yum", instagramHandle: "pinchofyum", category: "Food" },
  { displayName: "Deb Perelman", instagramHandle: "smittenkitchen", category: "Food" },
  { displayName: "Food52", instagramHandle: "food52", category: "Food" },
  { displayName: "Molly Baz", instagramHandle: "mollybaz", category: "Food" },
  { displayName: "Alison Roman", instagramHandle: "alisoneroman", category: "Food" },
  { displayName: "Kayla Itsines", instagramHandle: "kayla_itsines", category: "Fitness" },
  { displayName: "Joe Wicks", instagramHandle: "thebodycoach", category: "Fitness" },
  { displayName: "Chris Bumstead", instagramHandle: "cbum", category: "Fitness" },
  { displayName: "Simeon Panda", instagramHandle: "simeonpanda", category: "Fitness" },
  { displayName: "Jen Selter", instagramHandle: "jenselter", category: "Fitness" },
  { displayName: "Rachel Brathen", instagramHandle: "yoga_girl", category: "Wellness" },
  { displayName: "Massy Arias", instagramHandle: "massy.arias", category: "Fitness" },
  { displayName: "Kelsey Wells", instagramHandle: "kelseywells", category: "Fitness" },
  { displayName: "Michelle Lewin", instagramHandle: "michelle_lewin", category: "Fitness" },
  { displayName: "Cassey Ho", instagramHandle: "blogilates", category: "Fitness" },
  { displayName: "Murad Osmann", instagramHandle: "muradosmann", category: "Travel" },
  {
    displayName: "Beautiful Destinations",
    instagramHandle: "beautifuldestinations",
    category: "Travel",
  },
  { displayName: "Chris Burkard", instagramHandle: "chrisburkard", category: "Travel" },
  { displayName: "Sam Kolder", instagramHandle: "samkolder", category: "Travel" },
  { displayName: "Alex Strohl", instagramHandle: "alexstrohl", category: "Travel" },
  { displayName: "Jack Morris", instagramHandle: "doyoutravel", category: "Travel" },
  { displayName: "Lauren Bullen", instagramHandle: "gypsea_lust", category: "Travel" },
  { displayName: "Jessica Nabongo", instagramHandle: "thecatchmeifyoucan", category: "Travel" },
  { displayName: "Kiersten Rich", instagramHandle: "theblondeabroad", category: "Travel" },
  { displayName: "Brooke Saward", instagramHandle: "worldwanderlust", category: "Travel" },
] as const satisfies readonly PublicInstagramSeedProfile[];

function generateRandomName(): string {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${firstName} ${lastName}`;
}

function generateRandomEmail(name: string): string {
  const cleanName = name.toLowerCase().replace(/[^a-z]/g, "");
  const providers = ["gmail.com", "yahoo.com", "outlook.com", "company.com", "example.org"];
  const provider = providers[Math.floor(Math.random() * providers.length)];
  const suffix = Math.floor(Math.random() * 1000);
  return `${cleanName}${suffix}@${provider}`;
}

function generateRandomPhone(): string {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `+1${areaCode}${exchange}${number}`;
}

function generateMetadata(): Record<string, string> {
  const metadata: Record<string, string> = {};

  // 60% chance of dietary restriction
  if (Math.random() < 0.6) {
    const dietary = DIETARY_RESTRICTIONS[Math.floor(Math.random() * DIETARY_RESTRICTIONS.length)];
    metadata["dietary_restrictions"] = dietary;
  }

  // 40% chance of special request
  if (Math.random() < 0.4) {
    const request = SPECIAL_REQUESTS[Math.floor(Math.random() * SPECIAL_REQUESTS.length)];
    metadata["special_request"] = request;
  }

  // 30% chance of company
  if (Math.random() < 0.3) {
    const company = COMPANIES[Math.floor(Math.random() * COMPANIES.length)];
    metadata["company"] = company;
  }

  // 20% chance of plus one count
  if (Math.random() < 0.2) {
    const plusOnes = Math.floor(Math.random() * 3) + 1;
    metadata["plus_ones"] = plusOnes.toString();
  }

  return metadata;
}

function assertDevelopmentSeedAllowed(
  actionLabel: string,
  confirmEnvironment: string | undefined,
): void {
  if (confirmEnvironment === "development") {
    return;
  }

  throw new Error(
    `${actionLabel} only available in development. Convex bundles functions with NODE_ENV=production, so pass confirmEnvironment: "development" when running this against a dev deployment.`,
  );
}

function resolvePublicInstagramSeedCount(count: number | undefined): number {
  if (count === undefined) {
    return DEFAULT_PUBLIC_INSTAGRAM_SEED_COUNT;
  }

  if (!Number.isFinite(count)) {
    return DEFAULT_PUBLIC_INSTAGRAM_SEED_COUNT;
  }

  return Math.max(1, Math.min(Math.floor(count), PUBLIC_INSTAGRAM_SEED_PROFILES.length));
}

function splitDisplayName(displayName: string): { firstName: string; lastName?: string } {
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? displayName;
  const lastName = nameParts.slice(1).join(" ") || undefined;

  return { firstName, lastName };
}

function generateReservedSeedPhoneNumber(profileIndex: number): string {
  return `+1555010${String(profileIndex).padStart(4, "0")}`;
}

function resolvePublicInstagramSeedListKey(profileIndex: number): string {
  const listKeys = ["creator", "vip", "press", "friends"];
  return listKeys[profileIndex % listKeys.length] ?? "creator";
}

function resolvePublicInstagramSeedApprovalStatus(
  profileIndex: number,
): "pending" | "approved" | "denied" {
  const statusBucket = profileIndex % 10;
  if (statusBucket < 5) return "approved";
  if (statusBucket < 8) return "pending";
  return "denied";
}

function resolvePublicInstagramSeedAttendanceStatus(profileIndex: number): "yes" | "maybe" | "no" {
  const statusBucket = profileIndex % 12;
  if (statusBucket === 10) return "maybe";
  if (statusBucket === 11) return "no";
  return "yes";
}

function resolvePublicInstagramSeedInvitedBy(profileIndex: number): string | undefined {
  if (profileIndex === 0 || profileIndex % 3 !== 0) return undefined;

  const inviterProfile = PUBLIC_INSTAGRAM_SEED_PROFILES[profileIndex - 1];
  if (!inviterProfile) return undefined;

  return `${inviterProfile.displayName} (@${inviterProfile.instagramHandle})`;
}

export const seedPublicInstagramInfluencerEvent = action({
  args: {
    eventId: v.optional(v.id("events")),
    count: v.optional(v.number()),
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    eventName: v.optional(v.string()),
    confirmEnvironment: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    message: string;
    eventId: Id<"events">;
    created: number;
    errors: number;
    approved: number;
    pending: number;
    denied: number;
  }> => {
    assertDevelopmentSeedAllowed("Public Instagram seed", args.confirmEnvironment);

    const seedCount = resolvePublicInstagramSeedCount(args.count);
    const selectedProfiles = PUBLIC_INSTAGRAM_SEED_PROFILES.slice(0, seedCount);
    const eventId =
      args.eventId ??
      (
        await ctx.runMutation(internal.events.insertPublicInstagramDevSeedEvent, {
          workspaceSlug: args.workspaceSlug ?? DEFAULT_PUBLIC_INSTAGRAM_SEED_WORKSPACE_SLUG,
          siteKey: args.siteKey ?? DEFAULT_PUBLIC_INSTAGRAM_SEED_SITE_KEY,
          name: args.eventName,
        })
      ).eventId;

    if (args.eventId) {
      await ctx.runMutation(internal.events.ensurePublicInstagramDevSeedFields, {
        eventId,
      });
    }

    const seedBatchTimestamp = Date.now();
    const results = {
      created: 0,
      errors: 0,
      approved: 0,
      pending: 0,
      denied: 0,
    };

    console.log(`Starting public Instagram seed for ${selectedProfiles.length} users`);

    for (const [profileIndex, seedProfile] of selectedProfiles.entries()) {
      try {
        const { firstName, lastName } = splitDisplayName(seedProfile.displayName);
        const normalizedHandleForId = seedProfile.instagramHandle.replace(/[^a-z0-9]+/gi, "_");
        const clerkUserId = `seed_public_instagram_${seedBatchTimestamp}_${profileIndex}_${normalizedHandleForId}`;
        const publicProfileUrl = `https://instagram.com/${seedProfile.instagramHandle}`;
        const approvalStatus = resolvePublicInstagramSeedApprovalStatus(profileIndex);
        const listKey = resolvePublicInstagramSeedListKey(profileIndex);
        const createdAt = seedBatchTimestamp - (selectedProfiles.length - profileIndex) * 60_000;

        await ctx.runMutation(api.users.create, {
          clerkUserId,
          phone: generateReservedSeedPhoneNumber(profileIndex),
          firstName,
          lastName,
          metadata: {
            instagram: seedProfile.instagramHandle,
            publicProfileUrl,
            devSeedProfileCategory: seedProfile.category,
          },
        });

        const rsvpId = await ctx.runMutation(api.rsvps.createDirect, {
          eventId,
          clerkUserId,
          listKey,
          userName: seedProfile.displayName,
          shareContact: true,
          note: `Dev seed public Instagram profile: @${seedProfile.instagramHandle}`,
          attendees: profileIndex % 9 === 0 ? 2 : 1,
          smsConsent: false,
          customFieldValues: {
            profile_category: seedProfile.category,
            public_profile_url: publicProfileUrl,
          },
          socialProfiles: [
            {
              platformKey: "instagram",
              handle: seedProfile.instagramHandle,
            },
          ],
          invitedByName: resolvePublicInstagramSeedInvitedBy(profileIndex),
          status: approvalStatus,
          approvalStatus,
          attendanceStatus: resolvePublicInstagramSeedAttendanceStatus(profileIndex),
          createdAt,
        });

        if (approvalStatus === "approved") {
          await ctx.runMutation(api.redemptions.createForRSVP, {
            rsvpId,
            eventId,
            clerkUserId,
            listKey,
          });
        }

        results.created++;
        results[approvalStatus]++;
      } catch (error) {
        console.error(`Error creating public Instagram seed profile ${profileIndex}:`, error);
        results.errors++;
      }
    }

    return {
      success: true,
      message: `Created ${results.created} public Instagram seed users for event ${eventId} (${results.errors} errors)`,
      eventId,
      ...results,
    };
  },
});

export const seedTestRSVPs = action({
  args: {
    eventId: v.optional(v.id("events")),
    count: v.optional(v.number()),
    confirmEnvironment: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; message: string; eventId?: Id<"events"> }> => {
    assertDevelopmentSeedAllowed("Seed script", args.confirmEnvironment);

    const count = args.count || 1000;
    let eventId = args.eventId;

    // Create a test event if none provided
    if (!eventId) {
      const testEventResult = await ctx.runAction(api.eventsNode.create, {
        name: "Test Event - RSVP Stress Test",
        hosts: ["test@example.com"],
        location: "Virtual Event Center",
        eventDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 week from now
        lists: [
          { listKey: "vip", password: "vip123", generateQR: true },
          { listKey: "ga", password: "general456", generateQR: true },
          { listKey: "staff", password: "staff789", generateQR: false },
          { listKey: "media", password: "press999", generateQR: true },
        ],
        customFields: [
          {
            key: "dietary_restrictions",
            label: "Dietary Restrictions",
            placeholder: "Any dietary needs?",
          },
          {
            key: "company",
            label: "Company",
            placeholder: "Your company name",
          },
          {
            key: "special_request",
            label: "Special Requests",
            placeholder: "Any special accommodations?",
          },
          {
            key: "plus_ones",
            label: "Plus Ones",
            placeholder: "Number of guests",
          },
        ],
      });
      eventId = testEventResult.eventId;
    }

    const listKeys = ["vip", "ga", "staff", "media"];

    // Status distribution: 40% approved, 30% pending, 30% denied
    const statusWeights = [0.3, 0.4, 0.3]; // pending, approved, denied

    const results = {
      created: 0,
      errors: 0,
    };

    console.log(`Starting to seed ${count} RSVPs for event ${eventId}`);

    for (let rsvpIndex = 0; rsvpIndex < count; rsvpIndex++) {
      try {
        const name = generateRandomName();
        const { firstName, lastName } = splitDisplayName(name);
        const email = generateRandomEmail(name);
        const phone = generateRandomPhone();
        const listKey = listKeys[Math.floor(Math.random() * listKeys.length)];

        // Weighted random status selection
        const random = Math.random();
        let status: string;
        if (random < statusWeights[0]) {
          status = "pending";
        } else if (random < statusWeights[0] + statusWeights[1]) {
          status = "approved";
        } else {
          status = "denied";
        }

        const metadata = generateMetadata();

        // Create a fake Clerk user ID
        const clerkUserId = `seed_user_${Date.now()}_${rsvpIndex}`;

        const now = Date.now();

        // Insert user record
        await ctx.runMutation(api.users.create, {
          clerkUserId,
          phone,
          firstName,
          lastName,
          metadata: {
            email,
            ...metadata,
          },
        });

        // Insert RSVP
        const rsvpId = await ctx.runMutation(api.rsvps.createDirect, {
          eventId: eventId as Id<"events">,
          clerkUserId,
          listKey,
          userName: name,
          shareContact: Math.random() > 0.3, // 70% share contact
          note: Math.random() > 0.7 ? `Looking forward to the event! - ${name}` : undefined,
          customFieldValues: Object.keys(metadata).length > 0 ? metadata : undefined,
          status,
          createdAt: now - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000), // Random time in last 30 days
        });

        // If approved, maybe create redemption code (80% chance)
        if (status === "approved" && Math.random() < 0.8) {
          await ctx.runMutation(api.redemptions.createForRSVP, {
            rsvpId,
            eventId: eventId as Id<"events">,
            clerkUserId,
            listKey,
          });
        }

        results.created++;

        // Log progress every 100 records
        if (rsvpIndex % 100 === 0) {
          console.log(`Seeded ${rsvpIndex}/${count} RSVPs...`);
        }
      } catch (error) {
        console.error(`Error creating RSVP ${rsvpIndex}:`, error);
        results.errors++;
      }
    }

    console.log(`Seed complete! Created ${results.created} RSVPs with ${results.errors} errors`);

    return {
      success: true,
      message: `Successfully created ${results.created} test RSVPs (${results.errors} errors)`,
      eventId: eventId as Id<"events">,
    };
  },
});

export const clearTestData = action({
  args: {
    eventId: v.id("events"),
    confirmEnvironment: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message: string }> => {
    assertDevelopmentSeedAllowed("Clear test data", args.confirmEnvironment);

    // Delete all RSVPs for the event
    const rsvps = await ctx.runQuery(api.rsvps.listForEvent, {
      eventId: args.eventId,
    });

    let deletedCount = 0;
    for (const rsvp of rsvps) {
      try {
        // Delete related redemptions
        await ctx.runMutation(api.redemptions.deleteForRSVP, {
          rsvpId: rsvp.id,
        });

        // Delete the RSVP
        await ctx.runMutation(api.rsvps.deleteRSVP, { rsvpId: rsvp.id });

        // Delete the user if it's a seed user
        if (
          rsvp.clerkUserId.startsWith("seed_user_") ||
          rsvp.clerkUserId.startsWith("seed_public_instagram_")
        ) {
          await ctx.runMutation(api.users.deleteUser, {
            clerkUserId: rsvp.clerkUserId,
          });
        }

        deletedCount++;
      } catch (error) {
        console.error(`Error deleting RSVP ${rsvp.id}:`, error);
      }
    }

    return {
      success: true,
      message: `Deleted ${deletedCount} test RSVPs and related data`,
    };
  },
});
