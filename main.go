package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja/ast"
	"github.com/dop251/goja/parser"
	"github.com/evanw/esbuild/pkg/api"
)

// config.json映射
type Config struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	CallProtect bool   `json:"callprotect"`
}

// 全局配置
var config Config

type ProgressBar struct {
	width     int
	startTime time.Time
	mu        sync.Mutex
}

// NewProgressBar 创建一个新的进度条实例
func NewProgressBar(width int) *ProgressBar {
	if width <= 0 {
		width = 28
	}
	return &ProgressBar{
		width:     width,
		startTime: time.Now(),
	}
}

// Update 更新进度条显示
func (pb *ProgressBar) Update(current, total int64, msg string) {
	pb.mu.Lock()
	defer pb.mu.Unlock()

	if total <= 0 {
		total = 1
	}
	if current < 0 {
		current = 0
	}
	if current > total {
		current = total
	}

	// 计算百分比
	percent := float64(current) / float64(total) * 100
	filled := int(math.Round(float64(pb.width) * percent / 100))

	// 计算耗时
	elapsed := time.Since(pb.startTime).Seconds()

	// 构建颜色字符串
	bar := fmt.Sprintf("\x1b[36m%s\x1b[90m%s\x1b[0m",
		strings.Repeat("▓", filled),
		strings.Repeat("░", pb.width-filled))

	pct := fmt.Sprintf("\x1b[1m%3.0f%%\x1b[0m", percent)
	ratio := fmt.Sprintf("\x1b[90m%d/%d\x1b[0m", current, total)
	timeStr := fmt.Sprintf("\x1b[33m%.1fs\x1b[0m", elapsed)
	time.Sleep(time.Millisecond * 100)

	// 输出到控制台
	// \r 回到行首, \x1b[2K 清除当前行
	fmt.Printf("\r\x1b[2K  %s [%s] %s %s %s", pct, bar, ratio, timeStr, msg)
}

// Clear 清除当前行
func (pb *ProgressBar) Clear() {
	pb.mu.Lock()
	defer pb.mu.Unlock()
	fmt.Print("\r\x1b[2K")
}

var opcodes []string

func LoadEnumMap(filePath string, enumName string) (map[string]string, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	// 提取枚举块
	blockRegex := regexp.MustCompile(fmt.Sprintf(`(?s)export\s+enum\s+%v\s*\{(.*?)\}`, enumName))
	matches := blockRegex.FindSubmatch(content)
	if len(matches) < 2 {
		return nil, fmt.Errorf("未在文件中找到 enum %v", enumName)
	}

	// 准备结果Map
	defineMap := make(map[string]string)

	// 逐行解析枚举成员
	memberRegex := regexp.MustCompile(`(\w+)\s*=\s*"([^"]+)"`)
	items := memberRegex.FindAllStringSubmatch(string(matches[1]), -1)

	for _, item := range items {
		defineMap[item[1]] = item[2]
	}

	return defineMap, nil
}

func isVaildBlockType(blockType string) bool {
	targetKey := fmt.Sprintf("Scratch.BlockType.%v", blockType)
	_, ok := AllowedBlockTyps[targetKey]
	return ok
}

func getValueFromPropertyList(value *[]ast.Property, name string) (*ast.Expression, bool) {
	for _, prop := range *value {
		keyed, ok := prop.(*ast.PropertyKeyed)
		if !ok {
			continue
		}
		switch k := keyed.Key.(type) {
		case *ast.StringLiteral:
			if k.Value.String() == name {
				return &keyed.Value, true
			}
		case *ast.Identifier:
			if k.Name.String() == name {
				return &keyed.Value, true
			}
		}
	}
	return nil, false
}

func replaceSourceRange(source string, start, end int, replacement string) string {
	return source[:start] + replacement + source[end:]
}

func appendPropertyToObjectLiteral(source string, obj *ast.ObjectLiteral, propertySource string) string {
	insertStart := int(obj.Idx0())
	insertEnd := int(obj.Idx1()) - 2
	inner := source[insertStart:insertEnd]
	if strings.TrimSpace(inner) == "" {
		return source[:insertStart] + " " + propertySource + " " + source[insertEnd:]
	}

	trimmedRight := strings.TrimRight(inner, " \t\r\n")
	trailingWhitespace := inner[len(trimmedRight):]
	if strings.HasSuffix(strings.TrimSpace(trimmedRight), ",") {
		return source[:insertStart] + trimmedRight + " " + propertySource + trailingWhitespace + source[insertEnd:]
	}

	return source[:insertStart] + trimmedRight + ", " + propertySource + trailingWhitespace + source[insertEnd:]
}

func injectCommandSecretField(source string, infoObj *ast.ObjectLiteral) (string, error) {
	fieldsValue, ok := getValueFromPropertyList(&infoObj.Value, "fields")
	if !ok {
		return appendPropertyToObjectLiteral(source, infoObj, "fields: { secret: Math.random() }"), nil
	}

	fieldsObj, ok := (*fieldsValue).(*ast.ObjectLiteral)
	if !ok {
		return "", fmt.Errorf("'fields' need an object value when callprotect is enabled")
	}

	secretValue, ok := getValueFromPropertyList(&fieldsObj.Value, "secret")
	if ok {
		start := int((*secretValue).Idx0()) - 1
		end := int((*secretValue).Idx1()) - 1
		return replaceSourceRange(source, start, end, "Math.random()"), nil
	}

	return appendPropertyToObjectLiteral(source, fieldsObj, "secret: Math.random()"), nil
}

// Scratch.BlockType
var AllowedBlockTyps map[string]string = make(map[string]string)

type BlockFile struct {
	path   string
	opcode string
}

func Compline(config *Config) *api.BuildResult {
	var entryPoints []string
	// var files []string
	var blockFilesLock sync.Mutex
	var blockFiles []BlockFile
	progressBar := NewProgressBar(28)
	var scannedCount int64
	var compiledCount atomic.Int64
	workDir, err := os.Getwd()
	if err != nil {
		return &api.BuildResult{}
	}
	// var filesToOpcode
	err = filepath.WalkDir("src", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// 过滤.js和.ts
		if !d.IsDir() && (strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".ts")) {
			scannedCount++
			entryPoints = append(entryPoints, path)                             // 传入esbuild的列表
			normalizedPath := filepath.ToSlash(path)                            // 路径标准化
			targetPath := strings.Replace(normalizedPath, "src/", "blocks/", 1) // 替换为产物目录
			if strings.HasSuffix(targetPath, ".ts") {
				targetPath = strings.TrimSuffix(targetPath, ".ts") + ".js"
			}
			blockFilesLock.Lock()
			blockFiles = append(blockFiles, BlockFile{path: targetPath})
			blockFilesLock.Unlock()
			progressBar.Update(scannedCount, scannedCount, fmt.Sprintf("Scanning %s", normalizedPath))
			// fmt.Printf("[Scan]原始文件: %v\n", path)
			// fmt.Printf("[Scan]获取到文件: %v\n", strings.Replace(normalizedPath, "src/", "blocks/", 1))
		}
		return nil
	})

	if err != nil {
		fmt.Printf("Failed when scan 'src' dictionary\n\n%v\n", err)
		os.Exit(1)
	}
	if len(entryPoints) == 0 {
		progressBar.Clear()
		fmt.Println("There isn't any file to compline")
	}

	totalFiles := int64(len(entryPoints))
	progressBar.Update(0, totalFiles, fmt.Sprintf("Scan complete, %d files", totalFiles))

	// fmt.Printf("")
	var opcodesLock sync.Mutex
	result := api.Build(api.BuildOptions{
		EntryPoints: entryPoints,
		Bundle:      true,
		Write:       true,
		Outdir:      "dist/blocks",

		Format: api.FormatESModule,
		// Define处理编译期常量
		Define: AllowedBlockTyps,
		Plugins: []api.Plugin{
			{
				Name: "plugin-transformer",
				Setup: func(build api.PluginBuild) {
					build.OnLoad(api.OnLoadOptions{Filter: `\.(js|ts)$`}, func(args api.OnLoadArgs) (api.OnLoadResult, error) {
						relPath, err := filepath.Rel(workDir, args.Path)
						if err != nil {
							return api.OnLoadResult{}, err
						}
						filepath.ToSlash(relPath)
						jsImportPath := strings.Replace(relPath, "src\\", "blocks/", 1)
						jsImportPath = strings.Replace(jsImportPath, "src/", "blocks/", 1)
						if strings.HasSuffix(jsImportPath, ".ts") {
							jsImportPath = strings.TrimSuffix(jsImportPath, ".ts") + ".js"
						}
						// fmt.Printf("[Build]正在处理: %v\n", jsImportPath)
						// const targetString string = "/src/"
						// if v := strings.LastIndex(args.Path, targetString); v != -1 {
						// 	fileName := args.Path[v+len(targetString):]
						// 	fmt.Printf("正在处理: %v", fileName)
						// } else {
						// 	return api.OnLoadResult{}, fmt.Errorf("Error file source: %v", args.Path)
						// }
						content, err := os.ReadFile(args.Path)
						if err != nil {
							return api.OnLoadResult{}, err
						}

						jsContent := string(content)
						jsContent = strings.ReplaceAll(jsContent, "\u00a0", " ")
						if strings.HasSuffix(args.Path, ".ts") {
							transformed := api.Transform(string(content), api.TransformOptions{
								Loader: api.LoaderTS, // 告诉 esbuild 这是 TS
								Format: api.FormatESModule,
							})
							if len(transformed.Errors) > 0 {
								return api.OnLoadResult{}, fmt.Errorf("TS 转换失败: %v", transformed.Errors[0].Text)
							}
							jsContent = string(transformed.Code)
							// fmt.Printf("[DEBUG] 转换后的代码:\n%s\n", jsContent)
						}

						// 解析 AST
						program, err := parser.ParseFile(nil, args.Path, jsContent, 0)
						if err != nil {
							return api.OnLoadResult{}, fmt.Errorf("AST Parsing failed: %v", err)
						}

						// 校验字段
						hasInfo := false      // 是否存在info字段
						hasBlockType := false // 是否存在blockType字段
						hasFunc := false      // 是否有处理函数
						var opcode string
						isCommandBlock := false        // 是否为 COMMAND 类型的积木
						var infoObj *ast.ObjectLiteral // 保存 info 对象的 AST 节点引用
						// exportedInfo := false // 是否导出了info
						// exportedFunc := false // 是否导出了func
						for _, stmt := range program.Body {
							// 使用 switch type 统一处理 VariableStatement (var) 和 LexicalDeclaration (const/let)
							var declarations []ast.Expression
							var initializes []ast.Expression

							switch decl := stmt.(type) {
							case *ast.VariableStatement:
								for _, v := range decl.List {
									declarations = append(declarations, v.Target)
									initializes = append(initializes, v.Initializer)
								}
							case *ast.LexicalDeclaration:
								for _, v := range decl.List {
									declarations = append(declarations, v.Target)
									initializes = append(initializes, v.Initializer)
								}
							case *ast.FunctionDeclaration:
								if decl.Function != nil && decl.Function.Name != nil {
									if decl.Function.Name.Name.String() == "func" {
										hasFunc = true
									}
								}
							}

							// 检查是否有名为 "info" 的标识符
							for index, target := range declarations {
								id, ok := target.(*ast.Identifier)
								if ok && id.Name == "info" {
									hasInfo = true

									obj, ok := initializes[index].(*ast.ObjectLiteral)
									if !ok {
										return api.OnLoadResult{}, fmt.Errorf("'info' object does not a object")
									}
									infoObj = obj

									// 对BlockType及类型进行校验
									value, ok := getValueFromPropertyList(&obj.Value, "blockType") // 尝试获取blockType字段
									if !ok {
										return api.OnLoadResult{}, fmt.Errorf("'info' lost blockType")
									}
									switch v := (*value).(type) {
									case *ast.StringLiteral:
										return api.OnLoadResult{}, fmt.Errorf("Please use Scratch.BlockType rather than string literal")
									case *ast.DotExpression:
										if !isVaildBlockType(v.Identifier.Name.String()) { // 判断Identifier是否为合法的BlockType字符串
											return api.OnLoadResult{}, fmt.Errorf("Invaild blockType: %v", v.Identifier.Name.String())
										}
										if v.Identifier.Name.String() == "COMMAND" {
											isCommandBlock = true
										}
										// 继续断言
										dot, ok := v.Left.(*ast.DotExpression)
										if !ok || dot.Identifier.Name.String() != "BlockType" {
											return api.OnLoadResult{}, fmt.Errorf("Invalid blockType value")
										}
										leftIdent, ok := dot.Left.(*ast.Identifier)
										if !ok || leftIdent.Name.String() != "Scratch" {
											return api.OnLoadResult{}, fmt.Errorf("Invalid blockType value")
										}
										hasBlockType = true // 标记存在blockType字段
									default:
										return api.OnLoadResult{}, fmt.Errorf("Unknow value type of blockType")
									}

									// 对opcode及类型进行校验
									value, ok = getValueFromPropertyList(&obj.Value, "opcode")
									if !ok {
										return api.OnLoadResult{}, fmt.Errorf("'info' lost opcode")
									}
									v, ok := (*value).(*ast.StringLiteral)
									if !ok {
										return api.OnLoadResult{}, fmt.Errorf("opcode need a string value")
									}
									opcode = v.Value.String()
									opcodesLock.Lock()
									if slices.Contains(opcodes, opcode) {
										return api.OnLoadResult{}, fmt.Errorf("Mutiple define opcode: %v", opcode)
									}
									opcodes = append(opcodes, opcode)
									opcodesLock.Unlock()
									blockFilesLock.Lock()
									for key, i := range blockFiles {
										if i.path == jsImportPath {
											blockFiles[key].opcode = opcode
											blockFilesLock.Unlock()
											break
										}
									}

									// 对text及其类型进行校验
									value, ok = getValueFromPropertyList(&obj.Value, "text")
									if !ok {
										return api.OnLoadResult{}, fmt.Errorf("'info' lost text")
									}
									_, ok = (*value).(*ast.StringLiteral)
									if !ok {
										return api.OnLoadResult{}, fmt.Errorf("text need a string value")
									}

									// 确定func参数不存在
									value, ok = getValueFromPropertyList(&obj.Value, "func")
									if ok {
										return api.OnLoadResult{}, fmt.Errorf("Frame will deal with 'func' automatically, please do not add it")
									}
								}
							}
						}

						if !hasInfo {
							return api.OnLoadResult{}, fmt.Errorf("contract violation: missing 'info' object")
						}

						if !hasBlockType {
							return api.OnLoadResult{}, fmt.Errorf("lost blockType")
						}

						// 注入 CallProtect 逻辑：当配置开启且类型为COMMAND时注入 fields.secret = Math.random()
						if config.CallProtect && isCommandBlock && infoObj != nil {
							var err error
							jsContent, err = injectCommandSecretField(jsContent, infoObj)
							if err != nil {
								return api.OnLoadResult{}, err
							}
						}

						injectedFunc := ""
						if !hasFunc {
							// fmt.Printf("[Warn]The block %v lost func, inject defalut warn function\n", opcode)
							// 注入一个默认实现的 func，并直接嵌入积木ID
							injectedFunc = "\nfunction func() {\n    console.warn(\"[AxtFrame]The block " + opcode + " dosen't have func\");\n}\n"
						}

						// 注入导出语句
						modifiedContent := jsContent + injectedFunc + "\nexport { info, func };"

						current := compiledCount.Add(1)
						progressBar.Update(current, totalFiles, fmt.Sprintf("Building %s", filepath.ToSlash(jsImportPath)))

						return api.OnLoadResult{
							Contents: &modifiedContent,
							Loader:   api.LoaderJS,
						}, nil
					})
				},
			},
		},
	})

	// 生成.temp_entry.js
	// sort.Strings(files)
	// sort.Strings(opcodes)
	var importCommand string
	var registerCommand string

	for k, v := range blockFiles {
		importCommand += fmt.Sprintf("import * as block_%v from './%v';\n", k, v.path)
		registerCommand += fmt.Sprintf("        this._registerBlock(\"%v\", block_%v);\n", v.opcode, k)
	}

	// 应用 config.json 中的配置，若为空则使用默认值
	extID := config.ID
	if extID == "" {
		extID = "shangcloud"
	}
	extName := config.Name
	if extName == "" {
		extName = "ShangCloud"
	}

	var entryTemplate string = fmt.Sprintf(
		`import { AxtBase } from '../scripts/BaseExtension';
%v

class Extension extends AxtBase {
	constructor(runtime) {
		super(runtime, '%v', '%v');
%v
	}
}

Scratch.extensions.register(new Extension(window.Scratch.vm.runtime));`, importCommand, extID, extName, registerCommand)
	os.WriteFile("./dist/.temp-entry.js", []byte(entryTemplate), 0644)
	progressBar.Clear()

	return &result
}

// cleanTempFiles 清理编译过程中产生的中间文件
func cleanTempFiles() {
	os.RemoveAll("dist/blocks")
	os.Remove("./dist/.temp-entry.js")
}

func main() {
	// 解析根目录下的config.json
	configData, err := os.ReadFile("config.json")
	if err == nil {
		if err := json.Unmarshal(configData, &config); err != nil {
			fmt.Printf("解析 config.json 失败: %v\n", err)
		}
	} else if !os.IsNotExist(err) {
		fmt.Printf("读取 config.json 失败: %v\n", err)
	}

	// 解析extension.d.ts中的Scratch.BlockType
	types, err := LoadEnumMap("extension.d.ts", "BlockType")
	if err != nil {
		fmt.Printf("Error when load extension.d.ts: %v\n", err)
	}
	for k, v := range types {
		AllowedBlockTyps[fmt.Sprintf("Scratch.BlockType.%v", k)] = fmt.Sprintf("\"%v\"", v)
	}

	result := *Compline(&config)

	if len(result.Errors) > 0 {
		for _, v := range result.Errors {
			fmt.Printf("出现错误: %v\n", v.Text)
		}
		cleanTempFiles()
		os.Exit(1)
	}

	extBanner := map[string]string{}
	if config.CallProtect {
		injectorContent, err := os.ReadFile("./scripts/libs/blocky-injector.js")
		if err != nil {
			fmt.Printf("Failed when inject blocky-injector.js: %v\n", err)
			cleanTempFiles()
			os.Exit(1)
		}
		extBanner["js"] = string(injectorContent)
	}

	result = api.Build(api.BuildOptions{
		EntryPoints: []string{"./dist/.temp-entry.js"},
		Outfile:     "dist/extension.js", // 生成单文件
		Bundle:      true,
		Format:      api.FormatIIFE,
		GlobalName:  "ExtensionBundle",
		Write:       true,
		Banner:      extBanner,
	})
	// 清理中间文件
	cleanTempFiles()
	fmt.Printf("\x1b[32m✔\x1b[0m Built \x1b[1m%v\x1b[0m blocks", len(opcodes))

}
