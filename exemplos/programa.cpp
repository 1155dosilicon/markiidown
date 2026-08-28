// Exemplo de código C++
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

template <typename T>
class VectorUtils {
public:
    static void printAll(const std::vector<T>& vec) {
        for (const auto& item : vec) {
            std::cout << item << " ";
        }
        std::cout << std::endl;
    }
};

int main() {
    std::vector<std::string> names = {"MarkiiDown", "TypeScript", "Bun", "Windows"};
    std::sort(names.begin(), names.end());
    
    std::cout << "Lista Ordenada: ";
    VectorUtils<std::string>::printAll(names);
    return 0;
}
