import prisma from "./db/prisma";

const firstNames = [
  "هاشم",
  "ممرض",
  "ممد",
  "گونی",
  "گوساله",
  "گلابی",
  "فاطی",
  "سلطون علی",
  "توله",
  "تخم سگ",
  "پنبه",
  "بزمجه",
  "آبدزدک",
];

const lastNames = [
  "کماندو",
  "شیشه ای",
  "جوبیان",
  "سیگاری",
  "خراب",
  "هاپوزاده",
  "خر",
  "دزده",
  "اوبی تبار",
  "تو روغن",
];

const levels = [
  {
    name: "پاک",
    min: 0,
    max: 5,
  },
  {
    name: "چس دود",
    min: 5,
    max: 10,
  },
  {
    name: "مفت کش",
    min: 10,
    max: 15,
  },
  {
    name: "نخی کش",
    min: 15,
    max: 20,
  },
  {
    name: "سیگاری",
    min: 20,
    max: 30,
  },
  {
    name: "دودکش",
    min: 30,
    max: 40,
  },
  {
    name: "ساقی",
    min: 40,
    max: 50,
  },
  {
    name: "سرطان",
    min: 50,
    max: 70,
  },
];

const main = async () => {
  await prisma.firstName.deleteMany({});
  await prisma.lastName.deleteMany({});
  await prisma.level.deleteMany({});
  await prisma.firstName.createMany({
    data: firstNames.map((item) => ({ name: item })),
  });
  await prisma.lastName.createMany({
    data: lastNames.map((item) => ({ name: item })),
  });
  await prisma.level.createMany({
    data: levels.map((level) => ({
      max: level.max,
      min: level.min,
      name: level.name,
    })),
  });
};

main().finally(() => prisma.$disconnect());
