import OpenCC from "opencc-js/t2cn";

const convertTraditionalChinese = OpenCC.Converter({ from: "t", to: "cn" });

const mainlandTerminology = [
  ["使用者", "用户"],
  ["资料库", "数据库"],
  ["帐号", "账号"],
  ["作业系统", "操作系统"],
  ["网路", "网络"],
];

export function normalizeSimplifiedChinese(value) {
  return mainlandTerminology.reduce(
    (result, [source, target]) => result.replaceAll(source, target),
    convertTraditionalChinese(value)
  );
}

export function isNormalizedSimplifiedChinese(value) {
  return normalizeSimplifiedChinese(value) === value;
}
